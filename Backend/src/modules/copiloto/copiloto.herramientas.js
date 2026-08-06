import { Type } from '@google/genai'
import ReporteDano from '../../models/ReporteDano.js'
import * as requerimientosService from '../requerimientos/requerimientos.service.js'
import { validarItemsCompra, normalizarItemsCompra } from '../requerimientos/requerimientos.service.js'
import { ErrorValidacion } from '../../utils/errores.js'
import * as ausenciasService from '../ausencias/ausencias.service.js'
import { calcularResumen } from '../operacion/dashboard.service.js'
import { estaModuloActivo } from '../sistema/sistema.service.js'
import { buscarWikipedia, consultarClima } from './copiloto.internet.js'
import { recordarHecho, olvidarHecho, obtenerHechos } from './copiloto.memoria.js'
import { cacheHerramientas } from './copiloto.cache.js'

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
      modulo: 'requerimientos',
      // Crear un requerimiento es capacidad universal (ver requerimientos.
      // routes.js) — cualquier usuario autenticado puede pedir uno.
      //
      // ÚNICA herramienta de este archivo que no es de solo lectura, y aun
      // así NO ESCRIBE NADA en la base de datos: arma y valida un borrador
      // con las mismas reglas que crearRequerimiento(), pero el modelo no
      // tiene forma de guardarlo — el botón "Confirmar y enviar" que ve el
      // usuario llama a un endpoint aparte (POST /copiloto/requerimientos/
      // compra) que nunca pasa por Gemini. Así, sin importar qué decida el
      // modelo o qué tan convencido esté de que el usuario ya confirmó, es
      // imposible que cree un requerimiento real por su cuenta.
      declaracion: {
        name: 'preparar_requerimiento_compra',
        description:
          'Arma un BORRADOR de requerimiento de compra con los productos que pida el usuario. NO lo crea ni lo envía a nadie — solo prepara un resumen para que el usuario lo revise y confirme con un botón en la interfaz. Úsala en cuanto tengas al menos un producto con su cantidad; si falta el área/proceso o la fecha de algún ítem, usa un valor razonable (fecha de hoy) y dile al usuario qué asumiste para que lo corrija si hace falta.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            areaOProceso: { type: Type.STRING, description: 'Área o proceso que solicita, si el usuario lo mencionó.' },
            items: {
              type: Type.ARRAY,
              description: 'Uno por cada producto a comprar.',
              items: {
                type: Type.OBJECT,
                properties: {
                  descripcionProducto: { type: Type.STRING },
                  cantidad: { type: Type.NUMBER },
                  destino: { type: Type.STRING, description: 'Opcional: para qué o dónde se usará.' },
                  fechaSolicitud: { type: Type.STRING, description: 'Fecha en formato YYYY-MM-DD. Si no la dan, usa la fecha de hoy.' },
                },
                required: ['descripcionProducto', 'cantidad'],
              },
            },
          },
          required: ['items'],
        },
      },
      ejecutar: async ({ areaOProceso, items } = {}) => {
        if (!Array.isArray(items) || items.length === 0) {
          return { error: 'Debes indicar al menos un producto con su cantidad' }
        }
        // Mismo criterio de "hoy" que usaría cualquiera llenando el formulario
        // a mano el mismo día — el usuario puede corregirlo por chat si la
        // fecha real es otra, y eso arma un borrador nuevo.
        const hoy = new Date().toISOString().slice(0, 10)
        const itemsConFecha = items.map((it) => ({ ...it, fechaSolicitud: it.fechaSolicitud || hoy }))
        try {
          validarItemsCompra(itemsConFecha)
        } catch (err) {
          // ErrorValidacion trae un mensaje pensado para mostrarse tal cual;
          // cualquier otro tipo de error no debería poder llegar aquí, pero se
          // cubre iguial para no dejar una excepción sin capturar.
          return { error: err instanceof ErrorValidacion ? err.message : 'No se pudo armar el borrador' }
        }
        const normalizados = normalizarItemsCompra(itemsConFecha)
        return {
          borrador: true,
          tipo: 'compra',
          areaOProceso: areaOProceso ? String(areaOProceso).trim() : '',
          items: normalizados.map((it) => ({
            descripcionProducto: it.descripcionProducto,
            cantidad: it.cantidad,
            destino: it.destino,
            fechaSolicitud: it.fechaSolicitud.toISOString().slice(0, 10),
          })),
          mensaje:
            'Borrador armado. Descríbeselo brevemente al usuario y recuérdale que debe presionar "Confirmar y enviar" en la tarjeta para que quede guardado — todavía NO se ha creado ni se ha notificado a nadie.',
        }
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
    // Únicas dos herramientas que NO consultan datos del Terminal: dan acceso a
    // "cosas cotidianas" (clima, cultura general) vía APIs públicas gratuitas,
    // sin key ni cuenta — no Google Search (Gemini ya no lo da gratis para este
    // modelo, factura por búsqueda) ni scraping (frágil y contra los términos
    // de uso). Sin `modulo`: son universales, no dependen de RBAC del ERP.
    {
      declaracion: {
        name: 'buscar_wikipedia',
        description:
          'Busca un resumen enciclopédico en Wikipedia en español: definiciones, personas, lugares, historia, cultura general. NO sirve para datos en tiempo real (usa consultar_clima para el clima) ni para nada del Terminal de Transporte (usa las otras herramientas para eso).',
        parameters: {
          type: Type.OBJECT,
          properties: {
            consulta: { type: Type.STRING, description: 'Qué buscar, ej. "río Magdalena" o "Simón Bolívar".' },
          },
          required: ['consulta'],
        },
      },
      ejecutar: async ({ consulta }) => buscarWikipedia(consulta),
    },
    {
      declaracion: {
        name: 'consultar_clima',
        description: 'Devuelve el clima actual (temperatura, humedad, condición) de una ciudad. Útil para "¿qué clima hace en...?".',
        parameters: {
          type: Type.OBJECT,
          properties: {
            ciudad: { type: Type.STRING, description: 'Nombre de la ciudad, ej. "Neiva" o "Bogotá".' },
          },
          required: ['ciudad'],
        },
      },
      ejecutar: async ({ ciudad }) => consultarClima(ciudad),
    },
    // ── Memoria larga ───────────────────────────────────────────────────────
    // Las únicas dos herramientas que ESCRIBEN algo persistente, y lo que
    // escriben son notas del propio usuario sobre sí mismo — no datos del
    // Terminal. No hay forma de que toquen un requerimiento, una ausencia ni
    // un daño: `recordarHecho` solo sabe insertar pares clave/valor en el
    // documento de memoria de QUIEN pregunta (el id sale de la clausura, no de
    // un argumento del modelo), así que ni alucinando un id ajeno podría
    // escribir en la memoria de otra persona.
    {
      declaracion: {
        name: 'recordar',
        description:
          'Guarda un dato que el usuario te pide recordar para conversaciones futuras (su área habitual, cómo prefiere las respuestas, un proveedor que siempre usa). Úsala SOLO cuando la persona lo pida explícitamente ("acuérdate de que…", "de ahora en adelante…"), nunca por tu cuenta a partir de un comentario de paso.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            clave: {
              type: Type.STRING,
              description: 'Etiqueta corta del dato, en minúsculas, ej. "area habitual" o "formato de respuesta".',
            },
            valor: { type: Type.STRING, description: 'El dato a recordar, en una frase.' },
          },
          required: ['clave', 'valor'],
        },
      },
      ejecutar: async ({ clave, valor }) => recordarHecho(usuario.id_usuario, clave, valor),
    },
    {
      declaracion: {
        name: 'olvidar',
        description:
          'Borra un dato guardado con `recordar`. Úsala cuando el usuario pida que dejes de recordar algo. Si no sabes la clave exacta, primero consulta con `que_recuerdas`.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            clave: { type: Type.STRING, description: 'La clave exacta del dato a borrar.' },
          },
          required: ['clave'],
        },
      },
      ejecutar: async ({ clave }) => olvidarHecho(usuario.id_usuario, clave),
    },
    {
      declaracion: {
        name: 'que_recuerdas',
        description:
          'Lista todo lo que tienes guardado sobre este usuario. Úsala si te preguntan qué recuerdas de ellos o si necesitas la clave exacta de un dato antes de borrarlo.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      ejecutar: async () => obtenerHechos(usuario.id_usuario),
    },
  ]
}

// Herramientas de SOLO LECTURA cuyo resultado se puede reutilizar durante unos
// segundos. Es una lista explícita y no una bandera por defecto: olvidarse de
// marcar una herramienta nueva como cacheable solo la deja lenta, mientras que
// cachear por descuido una que escribe (recordar/olvidar) haría que la segunda
// llamada no se ejecutara nunca. El error barato es el correcto por defecto.
const CACHEABLES = new Set([
  'resumen_dashboard',
  'mis_requerimientos',
  'mis_reportes_dano',
  'mis_ausencias',
  'buscar_wikipedia',
  'consultar_clima',
])

// Envuelve `ejecutar` con la caché de resultados.
//
// La clave lleva el ID DEL USUARIO por delante, y eso no es un detalle: sin él
// dos personas distintas preguntando "mis requerimientos" compartirían entrada
// y la segunda vería los datos de la primera. Es la forma más fácil de
// convertir una caché en una fuga de datos, así que la clave se arma aquí, en
// un solo sitio, y no en cada herramienta.
//
// Wikipedia y el clima no dependen del usuario, pero se cachean con la misma
// clave igual: el desperdicio es una entrada por usuario en un Map acotado, y
// a cambio no hay que razonar caso por caso sobre si una herramienta devuelve
// datos personales o públicos.
function conCache(herramienta, usuario) {
  if (!CACHEABLES.has(herramienta.declaracion.name)) return herramienta
  const ejecutarReal = herramienta.ejecutar
  return {
    ...herramienta,
    ejecutar: (args = {}) => {
      const clave = `h:${usuario.id_usuario}:${herramienta.declaracion.name}:${JSON.stringify(args)}`
      return cacheHerramientas.through(clave, () => ejecutarReal(args))
    },
  }
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
  return activas.filter(Boolean).map((h) => conCache(h, usuario))
}
