import Usuario from '../../models/Usuario.js'
import Empresa from '../../models/Empresa.js'
import Vehiculo from '../../models/Vehiculo.js'
import Conductor from '../../models/Conductor.js'
import Plataforma from '../../models/Plataforma.js'
import Despacho from '../../models/Despacho.js'
import Novedad from '../../models/Novedad.js'
import ObjetoPerdido from '../../models/ObjetoPerdido.js'
import ReporteDano from '../../models/ReporteDano.js'
import { filtroScoped } from '../../utils/scope.js'

// Dashboard único para todos los roles: cada tarjeta se calcula SOLO si el
// usuario tiene el permiso correspondiente (el frontend pinta lo que llegue).
// Así un rol nuevo con otra mezcla de permisos obtiene su dashboard sin tocar
// este código.
export async function resumenDashboard(req, res) {
  const { usuario } = req
  const puede = (...codigos) =>
    usuario.esSuperAdmin || codigos.some((c) => usuario.permisos.has(c))

  const inicioDia = new Date()
  inicioDia.setHours(0, 0, 0, 0)

  const tareas = []
  const tarjetas = {}

  if (puede('usuarios:gestionar')) {
    tareas.push(async () => {
      tarjetas.usuarios = await Usuario.countDocuments({ estado: 'activo' })
    })
  }
  if (puede('empresas:gestionar')) {
    tareas.push(async () => {
      tarjetas.empresas = await Empresa.countDocuments({ estado: 'activo' })
    })
  }
  if (puede('vehiculos:gestionar', 'vehiculos:consultar')) {
    tareas.push(async () => {
      tarjetas.vehiculosActivos = await Vehiculo.countDocuments(filtroScoped(req, { estado: 'activo' }))
    })
  }
  if (puede('conductores:gestionar', 'conductores:consultar')) {
    tareas.push(async () => {
      tarjetas.conductoresActivos = await Conductor.countDocuments(filtroScoped(req, { estado: 'activo' }))
    })
  }
  if (puede('plataformas:gestionar', 'plataformas:cambiar')) {
    tareas.push(async () => {
      const [libres, ocupadas] = await Promise.all([
        Plataforma.countDocuments({ estado: 'libre' }),
        Plataforma.countDocuments({ estado: 'ocupada' }),
      ])
      tarjetas.plataformasLibres = libres
      tarjetas.plataformasOcupadas = ocupadas
    })
  }
  if (puede('despachos:registrar_salida', 'despachos:registrar_llegada', 'reportes:ver', 'empresas:ver_estadisticas')) {
    tareas.push(async () => {
      const base = filtroScoped(req, { horaSalida: { $gte: inicioDia } })
      const [hoy, enViaje, retrasados] = await Promise.all([
        Despacho.countDocuments({ ...base, estado: { $ne: 'anulado' } }),
        Despacho.countDocuments(filtroScoped(req, { estado: 'despachado' })),
        Despacho.countDocuments(filtroScoped(req, { estado: 'retrasado' })),
      ])
      tarjetas.despachosHoy = hoy
      tarjetas.despachosEnViaje = enViaje
      tarjetas.despachosRetrasados = retrasados
    })
  }
  if (puede('novedades:registrar', 'novedades:registrar_incidente', 'novedades:consultar_historial')) {
    tareas.push(async () => {
      tarjetas.novedadesAbiertas = await Novedad.countDocuments({ estado: 'abierta' })
    })
  }
  if (puede('objetos_perdidos:registrar', 'objetos_perdidos:gestionar')) {
    tareas.push(async () => {
      tarjetas.objetosEnCustodia = await ObjetoPerdido.countDocuments({ estado: 'custodia' })
    })
  }
  if (puede('danos:gestionar')) {
    tareas.push(async () => {
      // "Pendientes" = todo lo que sigue abierto, no solo lo que aún nadie
      // tomó: desde que existen los estados asignado/en_proceso/en_espera,
      // contar únicamente 'pendiente' escondía el trabajo ya en curso.
      tarjetas.danosPendientes = await ReporteDano.countDocuments({
        estado: { $nin: ['resuelto', 'cancelado'] },
      })
    })
  }

  // Todo usuario, sin permiso alguno: sus propios reportes de daño.
  tareas.push(async () => {
    tarjetas.misDanosReportados = await ReporteDano.countDocuments({
      reportadoPor: usuario.id_usuario,
      estado: { $ne: 'resuelto' },
    })
  })

  await Promise.all(tareas.map((t) => t()))

  res.json({ tarjetas })
}
