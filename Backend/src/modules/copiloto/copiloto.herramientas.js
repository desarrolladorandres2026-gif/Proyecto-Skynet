import { Type } from '@google/genai'
import ReporteDano from '../../models/ReporteDano.js'
import * as requerimientosService from '../requerimientos/requerimientos.service.js'
import * as ausenciasService from '../ausencias/ausencias.service.js'
import { calcularResumen } from '../operacion/dashboard.service.js'
import { estaModuloActivo } from '../sistema/sistema.service.js'

// Techo de resultados por herramienta: mantiene la respuesta liviana en
// tokens (y en costo, aunque Gemini se use en capa gratuita) — el copiloto
// responde preguntas puntuales ("¿cómo va mi requerimiento?"), no reemplaza
// las bandejas completas de cada módulo.
const LIMITE_LISTA = 15

function recortar(lista) {
  return lista.slice(0, LIMITE_LISTA)
}

// Mismo criterio que danos.controller.js#esTecnicoPuro: un técnico que solo
// ejecuta (no gestiona) NO puede reportar daños, así que preguntarle al
// copiloto por "los daños que reporté" no tiene sentido para él.
function esTecnicoPuro(usuario) {
  return (
    usuario.permisos?.has('mantenimiento:ejecutar') === true &&
    !usuario.esSuperAdmin &&
    !usuario.permisos?.has('danos:gestionar')
  )
}

// Mismo criterio que dashboard.service.js: Bodega no participa del flujo de
// daños en absoluto (ni reporta ni gestiona).
function esBodega(usuario) {
  return usuario.rol?.slug === 'bodega' && !usuario.esSuperAdmin
}

// Cada herramienta es de SOLO LECTURA y está acotada a los datos DEL USUARIO
// que pregunta (o a un resumen ya filtrado por su propio permiso, como el
// dashboard) — nunca a los de otra persona, y ninguna aprueba, rechaza ni
// modifica nada. `usuario` queda cerrado en cada `ejecutar` por clausura, así
// agregar una herramienta nueva es un único punto de cambio en este archivo:
// no hay forma de que el modelo pida el ID de otro usuario y reciba datos
// suyos, porque el filtro de propiedad nunca sale de las manos del backend.
//
// Además cada herramienta declara su alcance, y `construirHerramientas` las
// filtra ANTES de mandárselas al modelo:
//  - `modulo`: si el Super Admin lo apagó en /sistema/modulos, la herramienta
//    ni siquiera existe para el modelo (mismo gate que requiereModuloActivo
//    aplica al resto de la app; sin esto el chat seguía respondiendo de un
//    módulo apagado).
//  - `disponible(usuario)`: recorta por rol lo que a ese rol no le compete.
// Un modelo no puede invocar una herramienta que nunca vio declarada, así que
// esto es una restricción real, no una instrucción que pueda ignorar.
function catalogoHerramientas(usuario) {
  return [
    {
      declaracion: {
        name: 'resumen_dashboard',
        description:
          'Devuelve el resumen de tarjetas del panel principal del usuario que pregunta: conteos de pendientes en cada módulo al que tiene acceso (daños, requerimientos, ausencias, mantenimiento, etc.), igual a lo que ve en su Dashboard.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      ejecutar: async () => {
        const { tarjetas } = await calcularResumen(usuario)
        return tarjetas
      },
    },
    {
      modulo: 'requerimientos',
      declaracion: {
        name: 'mis_requerimientos',
        description:
          'Lista los requerimientos de compra/servicio que el usuario que pregunta ha solicitado, con su estado actual. Útil para responder "¿cómo va mi requerimiento?" o "¿qué tengo pendiente?".',
        parameters: {
          type: Type.OBJECT,
          properties: {
            estado: {
              type: Type.STRING,
              description:
                'Filtra por estado exacto: pendiente_financiero, pendiente_bodega, rechazado. Opcional, si no se indica devuelve todos.',
            },
          },
        },
      },
      ejecutar: async ({ estado } = {}) => {
        const lista = await requerimientosService.listarMios(usuario)
        const filtrada = estado ? lista.filter((r) => r.estado === estado) : lista
        return recortar(filtrada).map((r) => ({
          id: String(r._id),
          tipo: r.tipo,
          estado: r.estado,
          estadoBodega: r.estado === 'pendiente_bodega' ? r.bodega?.estado : undefined,
          areaOProceso: r.areaOProceso,
          creado: r.createdAt,
        }))
      },
    },
    {
      modulo: 'danos',
      // Reportar daños es capacidad universal MENOS para técnico puro y
      // Bodega, que no participan de ese flujo.
      disponible: (u) => !esTecnicoPuro(u) && !esBodega(u),
      declaracion: {
        name: 'mis_reportes_dano',
        description:
          'Lista los reportes de daño/novedad que el usuario que pregunta ha reportado, con su estado y quién lo tiene asignado. Útil para "¿en qué va el daño que reporté?".',
        parameters: {
          type: Type.OBJECT,
          properties: {
            estado: {
              type: Type.STRING,
              description:
                'Filtra por estado exacto: pendiente, asignado, en_proceso, en_espera, resuelto, cancelado. Opcional.',
            },
          },
        },
      },
      ejecutar: async ({ estado } = {}) => {
        const filtro = { reportadoPor: usuario.id_usuario }
        if (estado) filtro.estado = estado
        const reportes = await ReporteDano.find(filtro)
          .populate({ path: 'asignadoA', select: 'nombre' })
          .sort({ createdAt: -1 })
          .limit(LIMITE_LISTA)
          .lean()
        return reportes.map((r) => ({
          id: String(r._id),
          tipo: r.tipo,
          estado: r.estado,
          prioridad: r.prioridad,
          descripcion: r.descripcion,
          asignadoA: r.asignadoA?.nombre || null,
          creado: r.createdAt,
        }))
      },
    },
    {
      modulo: 'ausencias',
      declaracion: {
        name: 'mis_ausencias',
        description:
          'Lista las solicitudes de vacaciones, permisos o incapacidades del usuario que pregunta, con su estado. Útil para "¿me aprobaron las vacaciones?".',
        parameters: {
          type: Type.OBJECT,
          properties: {
            estado: {
              type: Type.STRING,
              description: 'Filtra por estado exacto: pendiente, aprobada, rechazada, cancelada. Opcional.',
            },
          },
        },
      },
      ejecutar: async ({ estado } = {}) => {
        const lista = await ausenciasService.listarMias(usuario)
        const filtrada = estado ? lista.filter((a) => a.estado === estado) : lista
        return recortar(filtrada).map((a) => ({
          id: String(a._id),
          tipo: a.tipo,
          estado: a.estado,
          fechaInicio: a.fechaInicio,
          fechaFin: a.fechaFin,
          diasHabiles: a.diasHabiles,
        }))
      },
    },
  ]
}

// Devuelve SOLO las herramientas que este usuario puede usar según su rol y
// según qué módulos estén activos. Lo que no pasa el filtro nunca se le
// declara al modelo, así que no puede invocarlo aunque el usuario se lo pida
// de forma insistente o creativa.
export async function construirHerramientas(usuario) {
  const candidatas = catalogoHerramientas(usuario).filter((h) => !h.disponible || h.disponible(usuario))
  const activas = await Promise.all(
    candidatas.map(async (h) => ((h.modulo ? await estaModuloActivo(h.modulo) : true) ? h : null))
  )
  return activas.filter(Boolean)
}
