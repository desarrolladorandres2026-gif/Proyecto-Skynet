import Usuario from '../../models/Usuario.js'
import ReporteDano from '../../models/ReporteDano.js'
import Requerimiento from '../../models/Requerimiento.js'
import Ausencia from '../../models/Ausencia.js'
import Rol from '../../models/Rol.js'
import RegistroAuditoria from '../../models/RegistroAuditoria.js'
import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import Notificacion from '../../models/Notificacion.js'
import { estaModuloActivo } from '../sistema/sistema.service.js'
import { hoy, restarMeses } from '../../utils/fechas.js'

// Mapeo: cada tarjeta solo se calcula si su módulo está activo.
// Las tarjetas sin módulo (ej: misDanosReportados) siempre se incluyen.
const TARJETA_A_MODULO = {
  danosPendientes: 'danos',
  requerimientosPendientes: 'requerimientos',
  requerimientosPorDespachar: 'requerimientos',
  ausenciasPendientes: 'ausencias',
  mantenimientoAbiertas: 'mantenimiento',
}

// OTs que ya no requieren atención: cerradas por el flujo CMMS o por el
// esquema legado que este modelo todavía acepta (ver Mantenimiento.js).
const ESTADOS_OT_CERRADOS = ['finalizado', 'cerrada', 'cancelada']

// Ventana para las 3 agregaciones de "analitica.*" de abajo (distribución de
// daños, flujo de requerimientos, estados de mantenimiento): antes agrupaban
// la colección COMPLETA sin ningún $match, así que cada carga del dashboard
// escaneaba/agrupaba TODO el histórico de daños/requerimientos/OTs. Hoy
// (2026-08) `analitica.*` no se renderiza en ningún componente activo del
// frontend — GraficasOperativas.jsx la consume pero no está montado en
// ContenidoRuta/DashboardPage — así que no hay "valor esperado por la
// interfaz" que se pueda romper con esto. Se acota a 3 meses (misma ventana
// que la retención de auditoría, ver auditoria.worker.js) en vez de
// eliminarlas, para que sigan siendo útiles si ese panel se reactiva más
// adelante, y para no dejar `analitica` con datos vacíos.
// Los CONTADORES reales de las tarjetas (danosPendientes,
// requerimientosPendientes, mantenimientoAbiertas, etc.), que sí se muestran
// hoy en el KPI ribbon, NO se tocan: siguen siendo countDocuments sobre el
// histórico completo, exactamente igual que antes.
function haceVentanaAnalitica() {
  return restarMeses(new Date(), 3)
}

/**
 * @param {object} usuario  req.usuario
 * @param {{soloTarjetas?: boolean}} opciones
 *        `soloTarjetas` calcula ÚNICAMENTE los contadores de las tarjetas y se
 *        salta todo lo demás (analítica, cola prioritaria, flujo semanal,
 *        recomendaciones). Lo usa el copiloto, que de este resumen solo lee
 *        `tarjetas` — ver copiloto.herramientas.js#resumen_dashboard.
 *
 *        No es una optimización cosmética: lo que se salta son SEIS
 *        agregaciones sobre tres meses de histórico (daños, requerimientos,
 *        mantenimiento y la serie de 7 días) más dos `find` de cola
 *        prioritaria. Medido contra Atlas, la herramienta bajó de ~700 ms a
 *        ~140 ms, y esos 560 ms los pagaba el usuario esperando en el chat cada
 *        vez que preguntaba "¿qué tengo pendiente?" — la pregunta más frecuente
 *        del asistente.
 *
 *        El dashboard real (GET /operacion/resumen) NO pasa por aquí: sigue
 *        recibiendo el objeto completo, con la misma forma y los mismos datos.
 */
export async function calcularResumen(usuario, { soloTarjetas = false } = {}) {
  const puede = (...codigos) =>
    usuario.esSuperAdmin || codigos.some((c) => usuario.permisos.has(c))
  const esAdmin = usuario.esSuperAdmin || usuario.rol?.slug === 'administrador'

  const puedeMostrarTarjeta = async (clave) => {
    const moduloRequerido = TARJETA_A_MODULO[clave]
    if (!moduloRequerido) return true
    return estaModuloActivo(moduloRequerido)
  }

  const tareas = []
  const tarjetas = {}
  const tendencias = {}
  const analitica = {
    distribucionDanos: { pendiente: 0, asignado: 0, en_proceso: 0, en_espera: 0, resuelto: 0 },
    criticidadDanos: { critica: 0, alta: 0, media: 0, baja: 0 },
    flujoRequerimientos: { financiero: 0, bodega: 0, despachado: 0, rechazado: 0 },
    mantenimientoEstados: { abiertas: 0, en_progreso: 0, cerradas: 0 },
    tasaResolucion: 100,
    saludGeneral: 95,
  }
  const flujoSemanal = []
  const recomendaciones = []
  const colaPrioritaria = []

  // 1. Tarjetas base y conteos

  // Notificaciones sin leer: universal, no depende de ningún permiso ni
  // módulo — es la bandeja propia del usuario (mismo dato que la campana de
  // AppLayout.jsx), y en el shell móvil (usuarios comunes) es la única forma
  // de verla desde el Resumen Operativo, ya que ese shell no tiene campana.
  tareas.push(async () => {
    tarjetas.notificaciones = await Notificacion.countDocuments({
      usuario: usuario.id_usuario,
      leida: false,
    })
  })

  if (esAdmin || puede('usuarios:gestionar')) {
    tareas.push(async () => {
      tarjetas.usuarios = await Usuario.countDocuments({ estado: 'activo', esPrueba: false })
    })
  }

  const danosActivo = await puedeMostrarTarjeta('danosPendientes')
  if (puede('danos:gestionar') && danosActivo) {
    tareas.push(async () => {
      const [pendientes, estados, criticidades, criticosRecientes] = await Promise.all([
        ReporteDano.countDocuments({ estado: { $nin: ['resuelto', 'cancelado'] } }),
        soloTarjetas
          ? []
          : ReporteDano.aggregate([
              { $match: { createdAt: { $gte: haceVentanaAnalitica() } } },
              { $group: { _id: '$estado', total: { $sum: 1 } } }
            ]),
        soloTarjetas
          ? []
          : ReporteDano.aggregate([
              { $match: { estado: { $nin: ['resuelto', 'cancelado'] } } },
              { $group: { _id: '$prioridad', total: { $sum: 1 } } }
            ]),
        soloTarjetas
          ? []
          : ReporteDano.find({ estado: { $nin: ['resuelto', 'cancelado'] }, prioridad: { $in: ['critica', 'alta'] } })
              .sort({ createdAt: -1 })
              .limit(4)
              .select('_id tipo descripcion prioridad estado fecha createdAt')
              .lean()
      ])

      tarjetas.danosPendientes = pendientes

      estados.forEach((e) => {
        if (analitica.distribucionDanos[e._id] !== undefined) {
          analitica.distribucionDanos[e._id] = e.total
        }
      })

      criticidades.forEach((c) => {
        if (analitica.criticidadDanos[c._id] !== undefined) {
          analitica.criticidadDanos[c._id] = c.total
        }
      })

      // Items para cola prioritaria
      criticosRecientes.forEach((d) => {
        colaPrioritaria.push({
          id: d._id.toString(),
          modulo: 'Daños',
          titulo: d.descripcion.length > 60 ? `${d.descripcion.slice(0, 60)}…` : d.descripcion,
          subtitulo: `Tipo: ${d.tipo} · Prioridad: ${d.prioridad}`,
          prioridad: d.prioridad,
          estado: d.estado,
          fecha: d.createdAt || d.fecha,
          to: '/danos/tareas'
        })
      })

      // Recomendaciones basadas en daños
      const criticosCount = (analitica.criticidadDanos.critica || 0) + (analitica.criticidadDanos.alta || 0)
      if (criticosCount > 0) {
        recomendaciones.push({
          id: 'danos-criticos',
          tipo: 'critico',
          titulo: `${criticosCount} ${criticosCount === 1 ? 'daño crítico o alto requiere' : 'daños críticos o altos requieren'} atención`,
          descripcion: 'Hay incidentes de alta prioridad sin resolver. Se recomienda priorizar la asignación inmediata de técnicos.',
          impacto: 'Alto',
          accion: 'Atender Daños',
          to: '/danos/tareas'
        })
      }
    })
  }

  const reqActivo = await puedeMostrarTarjeta('requerimientosPendientes')
  if ((esAdmin || puede('requerimientos:ver_todos')) && reqActivo) {
    tareas.push(async () => {
      const [pendientes, flujo, reqUrgentes] = await Promise.all([
        Requerimiento.countDocuments({
          estado: { $in: ['pendiente_financiero', 'pendiente_bodega'] },
        }),
        soloTarjetas
          ? []
          : Requerimiento.aggregate([
              { $match: { createdAt: { $gte: haceVentanaAnalitica() } } },
              { $group: { _id: '$estado', total: { $sum: 1 } } }
            ]),
        soloTarjetas
          ? []
          : Requerimiento.find({ estado: { $in: ['pendiente_financiero', 'pendiente_bodega'] } })
              .sort({ createdAt: 1 })
              .limit(3)
              .select('_id codigo estado tipo fechaSolicitud items createdAt')
              .lean()
      ])

      tarjetas.requerimientosPendientes = pendientes

      flujo.forEach((f) => {
        if (f._id === 'pendiente_financiero') analitica.flujoRequerimientos.financiero = f.total
        if (f._id === 'pendiente_bodega') analitica.flujoRequerimientos.bodega = f.total
        if (f._id === 'despachado' || f._id === 'completado' || f._id === 'aprobado') analitica.flujoRequerimientos.despachado += f.total
        if (f._id?.startsWith('rechazado')) analitica.flujoRequerimientos.rechazado += f.total
      })

      reqUrgentes.forEach((r) => {
        const desc = r.items?.[0]?.descripcionProducto || (r.tipo === 'servicio' ? 'Requerimiento de servicio' : 'Solicitud de compra')
        colaPrioritaria.push({
          id: r._id.toString(),
          modulo: 'Requerimientos',
          titulo: `Req: ${desc}`,
          subtitulo: r.estado === 'pendiente_financiero' ? 'En espera de Financiero' : 'Listo para Bodega',
          prioridad: r.estado === 'pendiente_financiero' ? 'alta' : 'media',
          estado: r.estado,
          fecha: r.createdAt || r.fechaSolicitud,
          to: r.estado === 'pendiente_bodega' ? '/requerimientos/bodega' : '/requerimientos/todos'
        })
      })

      if (analitica.flujoRequerimientos.financiero > 0) {
        recomendaciones.push({
          id: 'req-financiero',
          tipo: 'advertencia',
          titulo: `${analitica.flujoRequerimientos.financiero} solicitudes en espera financiera`,
          descripcion: 'Hay requerimientos de compra o servicio aguardando visto bueno administrativo para poder continuar.',
          impacto: 'Medio',
          accion: 'Revisar Solicitudes',
          to: '/requerimientos/todos'
        })
      }
    })
  }

  if (puede('requerimientos:gestionar_bodega') && reqActivo) {
    tareas.push(async () => {
      const porDespachar = await Requerimiento.countDocuments({ estado: 'pendiente_bodega' })
      tarjetas.requerimientosPorDespachar = porDespachar

      if (porDespachar > 0 && !recomendaciones.some((r) => r.id === 'req-bodega')) {
        recomendaciones.push({
          id: 'req-bodega',
          tipo: 'advertencia',
          titulo: `${porDespachar} requerimientos listos para despacho en Bodega`,
          descripcion: 'Artículos y materiales autorizados pendientes de entrega a las dependencias solicitantes.',
          impacto: 'Alto',
          accion: 'Despachar Ahora',
          to: '/requerimientos/bodega'
        })
      }
    })
  }

  const ausenciasActivo = await puedeMostrarTarjeta('ausenciasPendientes')
  if ((esAdmin || puede('ausencias:aprobar', 'ausencias:ver_todas')) && ausenciasActivo) {
    tareas.push(async () => {
      const ausencias = await Ausencia.countDocuments({ estado: 'pendiente' })
      tarjetas.ausenciasPendientes = ausencias

      if (ausencias > 0) {
        recomendaciones.push({
          id: 'ausencias-pendientes',
          tipo: 'informativo',
          titulo: `${ausencias} ${ausencias === 1 ? 'solicitud de ausencia pendiente' : 'solicitudes de ausencia pendientes'}`,
          descripcion: 'Colaboradores con solicitudes de permiso o incapacidad pendientes de aprobación.',
          impacto: 'Medio',
          accion: 'Decidir Ausencias',
          to: '/ausencias/bandeja'
        })
      }
    })
  }

  const mantActivo = await puedeMostrarTarjeta('mantenimientoAbiertas')
  if (
    (esAdmin || puede('mantenimiento:ver_todas', 'mantenimiento:asignar', 'mantenimiento:aprobar_cerrar')) &&
    mantActivo
  ) {
    tareas.push(async () => {
      const [abiertas, estadosOT] = await Promise.all([
        Mantenimiento.countDocuments({ estado: { $nin: ESTADOS_OT_CERRADOS } }),
        // Mantenimiento.js usa `timestamps: { createdAt: 'creado_en' }` (campo
        // legado en snake_case) — NO `createdAt` como los demás modelos.
        soloTarjetas
          ? []
          : Mantenimiento.aggregate([
              { $match: { creado_en: { $gte: haceVentanaAnalitica() } } },
              { $group: { _id: '$estado', total: { $sum: 1 } } }
            ])
      ])
      tarjetas.mantenimientoAbiertas = abiertas

      estadosOT.forEach((e) => {
        if (ESTADOS_OT_CERRADOS.includes(e._id)) {
          analitica.mantenimientoEstados.cerradas += e.total
        } else if (e._id === 'en_progreso' || e._id === 'asignada') {
          analitica.mantenimientoEstados.en_progreso += e.total
        } else {
          analitica.mantenimientoEstados.abiertas += e.total
        }
      })
    })
  }

  if (esAdmin || puede('roles:gestionar')) {
    tareas.push(async () => {
      tarjetas.rolesActivos = await Rol.countDocuments({ estado: 'activo' })
    })
  }

  if (esAdmin || puede('auditoria:leer')) {
    tareas.push(async () => {
      tarjetas.auditoriaHoy = await RegistroAuditoria.countDocuments({ creadoEn: { $gte: hoy() } })
    })
  }

  const esTecnicoPuro = usuario.permisos.has('mantenimiento:ejecutar') && !usuario.esSuperAdmin && !usuario.permisos.has('danos:gestionar')
  const esBodega = usuario.rol?.slug === 'bodega' && !usuario.esSuperAdmin
  const esUsuarioComun = usuario.rol?.slug === 'usuario_comun' && !usuario.esSuperAdmin

  if (!esTecnicoPuro && !esBodega && !esUsuarioComun) {
    tareas.push(async () => {
      tarjetas.misDanosReportados = await ReporteDano.countDocuments({
        reportadoPor: usuario.id_usuario,
        estado: { $ne: 'resuelto' },
      })
    })
  }

  if (usuario.esSuperAdmin || usuario.permisos.has('mantenimiento:ejecutar')) {
    tareas.push(async () => {
      const misTareas = await ReporteDano.countDocuments({
        asignadoA: usuario.id_usuario,
        estado: { $nin: ['resuelto', 'cancelado'] },
      })
      tarjetas.misTareasMantenimiento = misTareas

      if (misTareas > 0) {
        recomendaciones.unshift({
          id: 'mis-tareas',
          tipo: 'advertencia',
          titulo: `Tienes ${misTareas} ${misTareas === 1 ? 'tarea asignada pendiente' : 'tareas asignadas pendientes'}`,
          descripcion: 'Revisa tu bandeja de trabajo y actualiza el estado de las intervenciones a tu cargo.',
          impacto: 'Alto',
          accion: 'Ver Mis Tareas',
          to: '/danos/mis-tareas'
        })
      }
    })
  }

  // 2. Serie temporal de actividad de los últimos 7 días.
  // Dos agregaciones sobre ReporteDano que solo alimentan `flujoSemanal`, un
  // dato que el copiloto nunca lee: en modo `soloTarjetas` no se encolan.
  if (!soloTarjetas) tareas.push(async () => {
    const hace7Dias = new Date()
    hace7Dias.setDate(hace7Dias.getDate() - 6)
    hace7Dias.setHours(0, 0, 0, 0)

    const diasNombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const mapaDias = {}

    for (let i = 0; i < 7; i++) {
      const d = new Date(hace7Dias)
      d.setDate(d.getDate() + i)
      const clave = d.toISOString().split('T')[0]
      mapaDias[clave] = {
        dia: `${diasNombres[d.getDay()]} ${d.getDate()}`,
        creados: 0,
        resueltos: 0,
      }
    }

    try {
      const [danosCreados, danosResueltos] = await Promise.all([
        ReporteDano.aggregate([
          { $match: { createdAt: { $gte: hace7Dias } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              total: { $sum: 1 }
            }
          }
        ]),
        ReporteDano.aggregate([
          { $match: { estado: 'resuelto', updatedAt: { $gte: hace7Dias } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } },
              total: { $sum: 1 }
            }
          }
        ])
      ])

      danosCreados.forEach((dc) => {
        if (mapaDias[dc._id]) mapaDias[dc._id].creados += dc.total
      })
      danosResueltos.forEach((dr) => {
        if (mapaDias[dr._id]) mapaDias[dr._id].resueltos += dr.total
      })
    } catch {
      // Si falla la agregación histórica, se continúa sin romper
    }

    Object.values(mapaDias).forEach((v) => flujoSemanal.push(v))
  })

  await Promise.all(tareas.map((t) => t()))

  // 3. Cálculo de salud general y tasa de resolución
  const totalDanos = (analitica.distribucionDanos.pendiente || 0) +
    (analitica.distribucionDanos.asignado || 0) +
    (analitica.distribucionDanos.en_proceso || 0) +
    (analitica.distribucionDanos.en_espera || 0) +
    (analitica.distribucionDanos.resuelto || 0)

  if (totalDanos > 0) {
    const resueltos = analitica.distribucionDanos.resuelto || 0
    analitica.tasaResolucion = Math.round((resueltos / totalDanos) * 100)
  }

  // Deducciones de salud según cuellos de botella
  let scoreSalud = 98
  if ((tarjetas.danosPendientes || 0) > 10) scoreSalud -= 15
  else if ((tarjetas.danosPendientes || 0) > 5) scoreSalud -= 8

  if ((tarjetas.requerimientosPendientes || 0) > 8) scoreSalud -= 12
  else if ((tarjetas.requerimientosPendientes || 0) > 3) scoreSalud -= 5

  if ((tarjetas.ausenciasPendientes || 0) > 5) scoreSalud -= 8

  if ((analitica.criticidadDanos.critica || 0) > 0) scoreSalud -= 15

  analitica.saludGeneral = Math.max(45, Math.min(100, scoreSalud))

  // Si no hubo alertas críticas y la salud es alta, agregar recomendación de estado óptimo.
  // Solo para usuarios que de hecho tienen permiso de ver análisis/recomendaciones
  // (los mismos permisos que habilitan los bloques de recomendaciones de arriba);
  // de lo contrario un usuario común sin ningún permiso de gestión terminaba
  // viendo igual la sección porque `recomendaciones` le quedaba vacía.
  const puedeVerAnalisis = esAdmin || puede(
    'danos:gestionar',
    'requerimientos:ver_todos',
    'requerimientos:gestionar_bodega',
    'ausencias:aprobar',
    'ausencias:ver_todas',
    'mantenimiento:ver_todas',
    'mantenimiento:asignar',
    'mantenimiento:aprobar_cerrar',
    'mantenimiento:ejecutar',
  )

  if (recomendaciones.length === 0 && puedeVerAnalisis) {
    recomendaciones.push({
      id: 'estado-optimo',
      tipo: 'optimizacion',
      titulo: 'Operación al día y en control',
      descripcion: 'No hay cuellos de botella críticos ni retrasos acumulados en las áreas principales del sistema.',
      impacto: 'Bajo',
      accion: 'Ver Auditoría',
      to: '/auditoria'
    })
  }

  return {
    tarjetas,
    tendencias,
    analitica,
    flujoSemanal,
    recomendaciones,
    colaPrioritaria: colaPrioritaria.slice(0, 5),
  }
}

