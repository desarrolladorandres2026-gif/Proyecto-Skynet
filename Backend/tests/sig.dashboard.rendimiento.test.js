// Cobertura de las optimizaciones de rendimiento del dashboard SIG, el plan
// de refuerzo, el reporte individual, la exportación a Excel y el dashboard
// de operación (ver dashboard.service.js / sig-dashboard.service.js /
// sig-excel.service.js / comun.js) — ninguno tenía tests antes. El caso más
// importante es el de recalcularYObtenerPlanRefuerzo: verifica que la
// agregación agrupada + bulkWrite que reemplazó al loop secuencial original
// (aggregate + findOneAndUpdate por candidato) sigue eligiendo exactamente el
// mismo "tema con más errores" y el mismo porcentaje.
import { describe, it, expect, beforeEach } from 'vitest'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import ProgramacionSig from '../src/models/ProgramacionSig.js'
import RespuestaSig from '../src/models/RespuestaSig.js'
import PlanRefuerzoSig from '../src/models/PlanRefuerzoSig.js'
import ReporteDano from '../src/models/ReporteDano.js'
import {
  obtenerDashboard,
  recalcularYObtenerPlanRefuerzo,
  reporteTrabajador,
} from '../src/modules/sig_pregunta_dia/sig-dashboard.service.js'
import { exportarRespuestas } from '../src/modules/sig_pregunta_dia/sig-excel.service.js'
import { calcularResumen } from '../src/modules/operacion/dashboard.service.js'

async function crearUsuario(nombre_usuario) {
  const rol = await Rol.create({ nombre: `Rol ${nombre_usuario}`, slug: `rol-${nombre_usuario}`, esSuperAdmin: false })
  return Usuario.create({
    nombre_usuario,
    nombre: nombre_usuario,
    password: 'x'.repeat(10),
    email: `${nombre_usuario}@test.com`,
    rol: rol._id,
    dependencia: 'Operaciones',
    cargo: 'Auxiliar',
    estado: 'activo',
  })
}

async function crearProgramacion(creadoPorId, componenteSig, tema) {
  return ProgramacionSig.create({
    pregunta: new (await import('mongoose')).default.Types.ObjectId(),
    fechaProgramada: new Date(),
    fechaHoraPublicacion: new Date(),
    estado: 'publicada',
    publicadaEn: new Date(),
    snapshotPregunta: { enunciado: `¿Pregunta de ${tema}?`, opciones: [{ texto: 'A', esCorrecta: true }], componenteSig, tema },
    creadoPor: creadoPorId,
  })
}

describe('Smoke — optimizaciones de rendimiento SIG/operación', () => {
  let usuario1, admin

  beforeEach(async () => {
    usuario1 = await crearUsuario('trabajador1')
    admin = await crearUsuario('admin1')
  })

  it('recalcularYObtenerPlanRefuerzo detecta el nivel bajo y el tema con más errores (equivalente al loop original)', async () => {
    // El índice único {programacion, usuario} de RespuestaSig exige una
    // ProgramacionSig distinta por cada respuesta del mismo usuario.
    const progCorrecta = await crearProgramacion(admin._id, 'SST', 'Alturas')
    const progsAlturas = await Promise.all([1, 2, 3, 4].map(() => crearProgramacion(admin._id, 'SST', 'Alturas')))
    const progBloqueo = await crearProgramacion(admin._id, 'SST', 'Bloqueo y etiquetado')

    // 1 correcta + 4 incorrectas en "Alturas", 1 incorrecta en "Bloqueo" ->
    // porcentaje 1/6 = 17% (nivel crítico/bajo) y el tema con más errores
    // debe ser "Alturas" (4 errores) sobre "Bloqueo y etiquetado" (1 error).
    const base = { usuario: usuario1._id, componenteSigSnapshot: 'SST', dependenciaSnapshot: 'Operaciones', cargoSnapshot: 'Auxiliar', fechaProgramada: new Date(), respondidaEn: new Date() }
    await RespuestaSig.create({ ...base, programacion: progCorrecta._id, opcionIndice: 0, esCorrecta: true, temaSnapshot: 'Alturas' })
    for (const p of progsAlturas) {
      await RespuestaSig.create({ ...base, programacion: p._id, opcionIndice: 1, esCorrecta: false, temaSnapshot: 'Alturas' })
    }
    await RespuestaSig.create({ ...base, programacion: progBloqueo._id, opcionIndice: 1, esCorrecta: false, temaSnapshot: 'Bloqueo y etiquetado' })

    const planes = await recalcularYObtenerPlanRefuerzo({})
    expect(planes).toHaveLength(1)
    expect(String(planes[0].usuario._id)).toBe(String(usuario1._id))
    expect(planes[0].componenteSig).toBe('SST')
    expect(planes[0].tema).toBe('Alturas')
    expect(planes[0].porcentajeAcierto).toBe(17)

    // Segunda llamada: debe actualizar (upsert), no duplicar.
    const planesOtraVez = await recalcularYObtenerPlanRefuerzo({})
    expect(planesOtraVez).toHaveLength(1)
    const totalEnBD = await PlanRefuerzoSig.countDocuments({})
    expect(totalEnBD).toBe(1)
  })

  it('recalcularYObtenerPlanRefuerzo con cero candidatos no falla y no escribe nada', async () => {
    const prog = await crearProgramacion(admin._id, 'Calidad', 'Documentación')
    await RespuestaSig.create({
      usuario: usuario1._id, programacion: prog._id, opcionIndice: 0, esCorrecta: true,
      componenteSigSnapshot: 'Calidad', temaSnapshot: 'Documentación',
      dependenciaSnapshot: 'Operaciones', cargoSnapshot: 'Auxiliar', fechaProgramada: new Date(), respondidaEn: new Date(),
    })
    const planes = await recalcularYObtenerPlanRefuerzo({})
    expect(planes).toHaveLength(0)
    expect(await PlanRefuerzoSig.countDocuments({})).toBe(0)
  })

  it('obtenerDashboard (SIG) no falla y trae la forma esperada', async () => {
    const prog = await crearProgramacion(admin._id, 'Ambiental', 'Residuos')
    await RespuestaSig.create({
      usuario: usuario1._id, programacion: prog._id, opcionIndice: 0, esCorrecta: true,
      componenteSigSnapshot: 'Ambiental', temaSnapshot: 'Residuos',
      dependenciaSnapshot: 'Operaciones', cargoSnapshot: 'Auxiliar', fechaProgramada: new Date(), respondidaEn: new Date(),
    })
    const dash = await obtenerDashboard({})
    expect(dash.indicadores.totalRespuestas).toBe(1)
    expect(dash.indicadores.totalTrabajadores).toBeGreaterThanOrEqual(1)
    expect(Array.isArray(dash.distribucionNivel)).toBe(true)
  })

  it('reporteTrabajador (con .lean()) sigue devolviendo el historial poblado', async () => {
    const prog = await crearProgramacion(admin._id, 'Ambiental', 'Residuos')
    await RespuestaSig.create({
      usuario: usuario1._id, programacion: prog._id, opcionIndice: 0, esCorrecta: false,
      componenteSigSnapshot: 'Ambiental', temaSnapshot: 'Residuos',
      dependenciaSnapshot: 'Operaciones', cargoSnapshot: 'Auxiliar', fechaProgramada: new Date(), respondidaEn: new Date(),
    })
    const reporte = await reporteTrabajador(String(usuario1._id), {})
    expect(reporte.total).toBe(1)
    expect(reporte.historial[0].programacion.snapshotPregunta.enunciado).toContain('Residuos')
  })

  it('exportarRespuestas genera un .xlsx sin truncar cuando el volumen es bajo', async () => {
    const prog = await crearProgramacion(admin._id, 'SST', 'Alturas')
    await RespuestaSig.create({
      usuario: usuario1._id, programacion: prog._id, opcionIndice: 0, esCorrecta: true,
      componenteSigSnapshot: 'SST', temaSnapshot: 'Alturas',
      dependenciaSnapshot: 'Operaciones', cargoSnapshot: 'Auxiliar', fechaProgramada: new Date(), respondidaEn: new Date(),
    })
    const { buffer, total, truncado } = await exportarRespuestas({})
    expect(total).toBe(1)
    expect(truncado).toBe(false)
    expect(buffer.length).toBeGreaterThan(0)
  })

  it('calcularResumen (dashboard operación) no falla con la agregación acotada por fecha', async () => {
    await ReporteDano.create({
      tipo: 'dano', fecha: new Date(), descripcion: 'Prueba', reportadoPor: usuario1._id, estado: 'pendiente', prioridad: 'alta',
    })
    const usuarioFalso = {
      esSuperAdmin: true,
      permisos: new Set(),
      rol: { slug: 'administrador' },
      id_usuario: String(admin._id),
    }
    const resumen = await calcularResumen(usuarioFalso)
    expect(resumen.tarjetas.danosPendientes).toBe(1)
    expect(resumen.analitica.distribucionDanos.pendiente).toBe(1)
  })
})
