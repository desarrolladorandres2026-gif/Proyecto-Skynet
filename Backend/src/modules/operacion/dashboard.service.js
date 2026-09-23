import Usuario from '../../models/Usuario.js'
import ReporteDano from '../../models/ReporteDano.js'
import Requerimiento from '../../models/Requerimiento.js'
import Ausencia from '../../models/Ausencia.js'
import Rol from '../../models/Rol.js'
import RegistroAuditoria from '../../models/RegistroAuditoria.js'
import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import Notificacion from '../../models/Notificacion.js'
import { estaModuloActivo } from '../sistema/sistema.service.js'
import { hoy } from '../../utils/fechas.js'

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

/**
 * @param {object} usuario  req.usuario
 * @param {{soloTarjetas?: boolean}} opciones
 *        `soloTarjetas` calcula ÚNICAMENTE los contadores de las tarjetas y se
 *        salta la serie de 7 días (`flujoSemanal`). Lo usa el copiloto, que de
 *        este resumen solo lee `tarjetas` — ver
 *        copiloto.herramientas.js#resumen_dashboard.
 */
export async function calcularResumen(usuario, { soloTarjetas = false } = {}) {
  const puede = (...codigos) =>
    usuario.esSuperAdmin || codigos.some((c) => usuario.permisos.has(c))

  const puedeMostrarTarjeta = async (clave) => {
    const moduloRequerido = TARJETA_A_MODULO[clave]
    if (!moduloRequerido) return true
    return estaModuloActivo(moduloRequerido)
  }

  const tareas = []
  const tarjetas = {}
  const tendencias = {}
  const flujoSemanal = []

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

  if (puede('usuarios:gestionar')) {
    tareas.push(async () => {
      tarjetas.usuarios = await Usuario.countDocuments({ estado: 'activo', esPrueba: false })
    })
  }

  const danosActivo = await puedeMostrarTarjeta('danosPendientes')
  if (puede('danos:gestionar') && danosActivo) {
    tareas.push(async () => {
      tarjetas.danosPendientes = await ReporteDano.countDocuments({ estado: { $nin: ['resuelto', 'cancelado'] } })
    })
  }

  const reqActivo = await puedeMostrarTarjeta('requerimientosPendientes')
  const puedeVerTodosReq = puede('requerimientos:ver_todos')
  const puedeFinancieroReq = puede('requerimientos:aprobar_financiero')
  const puedeBodegaReq = puede('requerimientos:gestionar_bodega')

  if (reqActivo && (puedeVerTodosReq || puedeFinancieroReq || puedeBodegaReq)) {
    tareas.push(async () => {
      if (puedeVerTodosReq) {
        tarjetas.requerimientosPendientes = await Requerimiento.countDocuments({
          estado: { $in: ['pendiente_financiero', 'pendiente_bodega'] },
        })
      } else if (puedeFinancieroReq) {
        tarjetas.requerimientosPendientes = await Requerimiento.countDocuments({
          estado: 'pendiente_financiero',
        })
      }

      // Bodega gestiona un requerimiento sin cambiar el `estado` raíz (se
      // queda en 'pendiente_bodega' por diseño, ver Requerimiento.js): la
      // decisión vive en `bodega.estado`. Filtrar solo por `estado` cuenta
      // también los ya despachados/rechazados por Bodega, así que el
      // requerimiento nunca sale del contador ni de "listos para despacho".
      if (puedeBodegaReq) {
        tarjetas.requerimientosPorDespachar = await Requerimiento.countDocuments({
          estado: 'pendiente_bodega',
          'bodega.estado': 'pendiente',
        })
      }
    })
  }

  const ausenciasActivo = await puedeMostrarTarjeta('ausenciasPendientes')
  if (puede('ausencias:aprobar', 'ausencias:ver_todas') && ausenciasActivo) {
    tareas.push(async () => {
      tarjetas.ausenciasPendientes = await Ausencia.countDocuments({ estado: 'pendiente' })
    })
  }

  const mantActivo = await puedeMostrarTarjeta('mantenimientoAbiertas')
  if (
    puede('mantenimiento:ver_todas', 'mantenimiento:asignar', 'mantenimiento:aprobar_cerrar') &&
    mantActivo
  ) {
    tareas.push(async () => {
      tarjetas.mantenimientoAbiertas = await Mantenimiento.countDocuments({ estado: { $nin: ESTADOS_OT_CERRADOS } })
    })
  }

  if (puede('roles:gestionar')) {
    tareas.push(async () => {
      tarjetas.rolesActivos = await Rol.countDocuments({ estado: 'activo' })
    })
  }

  if (puede('auditoria:leer')) {
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
      tarjetas.misTareasMantenimiento = await ReporteDano.countDocuments({
        asignadoA: usuario.id_usuario,
        estado: { $nin: ['resuelto', 'cancelado'] },
      })
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

  return { tarjetas, tendencias, flujoSemanal }
}
