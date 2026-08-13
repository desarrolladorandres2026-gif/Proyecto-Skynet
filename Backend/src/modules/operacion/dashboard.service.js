import Usuario from '../../models/Usuario.js'
import ReporteDano from '../../models/ReporteDano.js'
import Requerimiento from '../../models/Requerimiento.js'
import Ausencia from '../../models/Ausencia.js'
import Rol from '../../models/Rol.js'
import RegistroAuditoria from '../../models/RegistroAuditoria.js'
import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
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

// Extraído de dashboard.controller.js para que copiloto.herramientas.js
// (el chat de IA) pueda reutilizar EXACTAMENTE el mismo cálculo con el mismo
// alcance por permiso/módulo que ya ve el usuario en su Dashboard, en vez de
// reimplementar el filtrado en dos lugares y arriesgar que se desincronicen.
export async function calcularResumen(usuario) {
  const puede = (...codigos) =>
    usuario.esSuperAdmin || codigos.some((c) => usuario.permisos.has(c))
  // Mismo criterio que esRolAdmin() en el frontend (AuthContext.jsx): Super
  // Admin y Administrador son los dos roles que ven el panel denso y esperan
  // el resumen completo de todos los módulos, aunque para algunas tarjetas
  // (usuarios, roles, auditoría) Administrador no tenga el permiso de
  // gestión — ver solo el conteo no otorga esa capacidad.
  const esAdmin = usuario.esSuperAdmin || usuario.rol?.slug === 'administrador'

  const puedeMostrarTarjeta = async (clave) => {
    const moduloRequerido = TARJETA_A_MODULO[clave]
    if (!moduloRequerido) return true // Sin módulo asociado, siempre se muestra
    return estaModuloActivo(moduloRequerido)
  }

  const tareas = []
  const tarjetas = {}
  const tendencias = {}

  if (esAdmin || puede('usuarios:gestionar')) {
    tareas.push(async () => {
      tarjetas.usuarios = await Usuario.countDocuments({ estado: 'activo' })
    })
  }
  if (puede('danos:gestionar') && (await puedeMostrarTarjeta('danosPendientes'))) {
    tareas.push(async () => {
      // "Pendientes" = todo lo que sigue abierto, no solo lo que aún nadie
      // tomó: desde que existen los estados asignado/en_proceso/en_espera,
      // contar únicamente 'pendiente' escondía el trabajo ya en curso.
      tarjetas.danosPendientes = await ReporteDano.countDocuments({
        estado: { $nin: ['resuelto', 'cancelado'] },
      })
    })
  }

  if ((esAdmin || puede('requerimientos:ver_todos')) && (await puedeMostrarTarjeta('requerimientosPendientes'))) {
    tareas.push(async () => {
      tarjetas.requerimientosPendientes = await Requerimiento.countDocuments({
        estado: { $in: ['pendiente_financiero', 'pendiente_bodega'] },
      })
    })
  }
  // Cola propia de Bodega: requerimientos ya aprobados por Financiero que
  // esperan su decisión/despacho. No usa requerimientos:ver_todos (esa es
  // supervisión de TODO el flujo) sino gestionar_bodega, el permiso real del
  // rol Bodega.
  if (puede('requerimientos:gestionar_bodega') && (await puedeMostrarTarjeta('requerimientosPorDespachar'))) {
    tareas.push(async () => {
      tarjetas.requerimientosPorDespachar = await Requerimiento.countDocuments({ estado: 'pendiente_bodega' })
    })
  }
  if ((esAdmin || puede('ausencias:aprobar', 'ausencias:ver_todas')) && (await puedeMostrarTarjeta('ausenciasPendientes'))) {
    tareas.push(async () => {
      tarjetas.ausenciasPendientes = await Ausencia.countDocuments({ estado: 'pendiente' })
    })
  }
  if (
    (esAdmin || puede('mantenimiento:ver_todas', 'mantenimiento:asignar', 'mantenimiento:aprobar_cerrar')) &&
    (await puedeMostrarTarjeta('mantenimientoAbiertas'))
  ) {
    tareas.push(async () => {
      tarjetas.mantenimientoAbiertas = await Mantenimiento.countDocuments({
        estado: { $nin: ESTADOS_OT_CERRADOS },
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
      // "Hoy" es el día en el Terminal, no en la zona del proceso Node: con
      // setHours(0,0,0,0) sobre el VPS (que corre en UTC), el contador se
      // reiniciaba a las 7 p.m. hora de Neiva y el turno de la noche aparecía
      // como actividad "de hoy" cuando ya era el día siguiente para el sistema.
      // Ver BUG-014 en la auditoría 2026-08-13.
      tarjetas.auditoriaHoy = await RegistroAuditoria.countDocuments({ creadoEn: { $gte: hoy() } })
    })
  }

  // Un técnico de mantenimiento "puro" (ejecuta, no gestiona) ya no puede
  // reportar daños (ver danos.controller.js#esTecnicoPuro) — mostrarle "Mis
  // daños reportados" es una tarjeta muerta que además enlaza a un formulario
  // bloqueado para él. En su lugar ve su propia carga de reparación.
  const esTecnicoPuro = usuario.permisos.has('mantenimiento:ejecutar') && !usuario.esSuperAdmin && !usuario.permisos.has('danos:gestionar')
  // Bodega no participa del flujo de daños en absoluto (ni reporta ni
  // gestiona vehículos) — su panel debe mostrar solo lo suyo: requerimientos
  // por despachar.
  const esBodega = usuario.rol?.slug === 'bodega' && !usuario.esSuperAdmin

  if (!esTecnicoPuro && !esBodega) {
    // Todo usuario que sí puede reportar: sus propios reportes de daño.
    tareas.push(async () => {
      tarjetas.misDanosReportados = await ReporteDano.countDocuments({
        reportadoPor: usuario.id_usuario,
        estado: { $ne: 'resuelto' },
      })
    })
  }

  if (usuario.esSuperAdmin || usuario.permisos.has('mantenimiento:ejecutar')) {
    // Lo que el técnico tiene asignado a ÉL para reparar — no confundir con
    // danosPendientes (arriba), que es la cola completa y exige danos:gestionar.
    tareas.push(async () => {
      tarjetas.misTareasMantenimiento = await ReporteDano.countDocuments({
        asignadoA: usuario.id_usuario,
        estado: { $nin: ['resuelto', 'cancelado'] },
      })
    })
  }

  await Promise.all(tareas.map((t) => t()))

  return { tarjetas, tendencias }
}
