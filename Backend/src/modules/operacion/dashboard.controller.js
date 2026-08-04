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
import { estaModuloActivo } from '../sistema/sistema.service.js'

// Mapeo: cada tarjeta solo se calcula si su módulo está activo.
// Las tarjetas sin módulo (ej: misDanosReportados) siempre se incluyen.
const TARJETA_A_MODULO = {
  empresas: 'flota',
  vehiculosActivos: 'flota',
  conductoresActivos: 'flota',
  plataformasLibres: 'flota',
  plataformasOcupadas: 'flota',
  despachosHoy: 'operacion',
  despachosEnViaje: 'operacion',
  despachosRetrasados: 'operacion',
  novedadesAbiertas: 'operacion',
  objetosEnCustodia: 'operacion',
  danosPendientes: 'danos',
}

// Dashboard único para todos los roles: cada tarjeta se calcula SOLO si el
// usuario tiene el permiso correspondiente Y el módulo está activo.
// Así un rol nuevo con otra mezcla de permisos obtiene su dashboard sin tocar
// este código, y una tarjeta desactivada se excluye automáticamente.
export async function resumenDashboard(req, res) {
  const { usuario } = req
  const puede = (...codigos) =>
    usuario.esSuperAdmin || codigos.some((c) => usuario.permisos.has(c))

  const puedeMostrarTarjeta = async (clave) => {
    const moduloRequerido = TARJETA_A_MODULO[clave]
    if (!moduloRequerido) return true // Sin módulo asociado, siempre se muestra
    return estaModuloActivo(moduloRequerido)
  }

  const inicioDia = new Date()
  inicioDia.setHours(0, 0, 0, 0)

  const tareas = []
  const tarjetas = {}
  // Deltas reales para TrendBadge (frontend): solo se calcula donde la
  // propia tarjeta ya es un conteo acotado a un rango de fecha (despachosHoy
  // usa horaSalida) — comparar hoy vs. ayer ahí es la MISMA métrica en dos
  // días. El resto de tarjetas (usuarios activos, vehículos activos,
  // novedades abiertas...) son conteos del estado ACTUAL de un padrón, no
  // eventos con fecha propia: no hay forma barata de saber "cuántos había
  // hace una semana" sin una foto histórica que no existe, y aproximarlo con
  // createdAt daría un número de una métrica distinta (altas nuevas, no el
  // tamaño del padrón) — se dejan sin tendencia en vez de mostrar un delta
  // que mide otra cosa.
  const tendencias = {}

  if (puede('usuarios:gestionar')) {
    tareas.push(async () => {
      tarjetas.usuarios = await Usuario.countDocuments({ estado: 'activo' })
    })
  }
  if (puede('empresas:gestionar') && (await puedeMostrarTarjeta('empresas'))) {
    tareas.push(async () => {
      tarjetas.empresas = await Empresa.countDocuments({ estado: 'activo' })
    })
  }
  if (puede('vehiculos:gestionar', 'vehiculos:consultar') && (await puedeMostrarTarjeta('vehiculosActivos'))) {
    tareas.push(async () => {
      tarjetas.vehiculosActivos = await Vehiculo.countDocuments(filtroScoped(req, { estado: 'activo' }))
    })
  }
  if (puede('conductores:gestionar', 'conductores:consultar') && (await puedeMostrarTarjeta('conductoresActivos'))) {
    tareas.push(async () => {
      tarjetas.conductoresActivos = await Conductor.countDocuments(filtroScoped(req, { estado: 'activo' }))
    })
  }
  if (puede('plataformas:gestionar', 'plataformas:cambiar') && (await puedeMostrarTarjeta('plataformasLibres'))) {
    tareas.push(async () => {
      const [libres, ocupadas] = await Promise.all([
        Plataforma.countDocuments({ estado: 'libre' }),
        Plataforma.countDocuments({ estado: 'ocupada' }),
      ])
      tarjetas.plataformasLibres = libres
      tarjetas.plataformasOcupadas = ocupadas
    })
  }
  if (puede('despachos:registrar_salida', 'despachos:registrar_llegada', 'reportes:ver', 'empresas:ver_estadisticas') && (await puedeMostrarTarjeta('despachosHoy'))) {
    tareas.push(async () => {
      const inicioAyer = new Date(inicioDia)
      inicioAyer.setDate(inicioAyer.getDate() - 1)
      const baseHoy = filtroScoped(req, { horaSalida: { $gte: inicioDia }, estado: { $ne: 'anulado' } })
      const baseAyer = filtroScoped(req, { horaSalida: { $gte: inicioAyer, $lt: inicioDia }, estado: { $ne: 'anulado' } })
      const [hoy, ayer, enViaje, retrasados] = await Promise.all([
        Despacho.countDocuments(baseHoy),
        Despacho.countDocuments(baseAyer),
        Despacho.countDocuments(filtroScoped(req, { estado: 'despachado' })),
        Despacho.countDocuments(filtroScoped(req, { estado: 'retrasado' })),
      ])
      tarjetas.despachosHoy = hoy
      tarjetas.despachosEnViaje = enViaje
      tarjetas.despachosRetrasados = retrasados
      tendencias.despachosHoy = { actual: hoy, anterior: ayer }
    })
  }
  if (puede('novedades:registrar', 'novedades:registrar_incidente', 'novedades:consultar_historial') && (await puedeMostrarTarjeta('novedadesAbiertas'))) {
    tareas.push(async () => {
      tarjetas.novedadesAbiertas = await Novedad.countDocuments({ estado: 'abierta' })
    })
  }
  if (puede('objetos_perdidos:registrar', 'objetos_perdidos:gestionar') && (await puedeMostrarTarjeta('objetosEnCustodia'))) {
    tareas.push(async () => {
      tarjetas.objetosEnCustodia = await ObjetoPerdido.countDocuments({ estado: 'custodia' })
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

  // Todo usuario, sin permiso alguno: sus propios reportes de daño.
  tareas.push(async () => {
    tarjetas.misDanosReportados = await ReporteDano.countDocuments({
      reportadoPor: usuario.id_usuario,
      estado: { $ne: 'resuelto' },
    })
  })

  await Promise.all(tareas.map((t) => t()))

  res.json({ tarjetas, tendencias })
}
