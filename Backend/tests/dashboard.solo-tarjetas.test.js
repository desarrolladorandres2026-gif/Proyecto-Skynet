import { describe, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'
import ReporteDano from '../src/models/ReporteDano.js'
import Ausencia from '../src/models/Ausencia.js'
import Notificacion from '../src/models/Notificacion.js'
import { calcularResumen } from '../src/modules/operacion/dashboard.service.js'

vi.mock('../src/modules/sistema/sistema.service.js', () => ({ estaModuloActivo: async () => true }))

// `resumen_dashboard` es la herramienta del copiloto que responde "¿qué tengo
// pendiente?", la pregunta más frecuente del asistente. Pedía el resumen
// operativo COMPLETO —seis agregaciones sobre tres meses de histórico más dos
// consultas de cola prioritaria— para quedarse solo con los contadores y tirar
// el resto. Medido contra Atlas: ~700 ms, de los cuales ~560 ms eran trabajo
// desperdiciado que el usuario esperaba en el chat.
//
// El modo `soloTarjetas` se salta ese trabajo. Lo que esta suite fija es lo
// único que no puede cambiar: que los contadores salgan IDÉNTICOS por los dos
// caminos. Si alguien mueve un contador dentro de un bloque que `soloTarjetas`
// omite, esto lo detecta.

const usuarioSuperAdmin = (id) => ({
  id_usuario: id,
  esSuperAdmin: true,
  permisos: new Set(),
  rol: { slug: 'super_admin' },
})

async function sembrar(usuarioId) {
  await ReporteDano.insertMany([
    { tipo: 'dano', fecha: new Date(), descripcion: 'Puerta rota', estado: 'pendiente', prioridad: 'alta', reportadoPor: usuarioId },
    { tipo: 'dano', fecha: new Date(), descripcion: 'Luz fundida', estado: 'asignado', prioridad: 'media', reportadoPor: usuarioId, asignadoA: usuarioId },
    { tipo: 'dano', fecha: new Date(), descripcion: 'Ya resuelto', estado: 'resuelto', prioridad: 'baja', reportadoPor: usuarioId },
  ])

  await Ausencia.insertMany([
    { solicitante: usuarioId, tipo: 'vacaciones', estado: 'pendiente', fechaInicio: new Date(), fechaFin: new Date(Date.now() + 86_400_000), diasHabiles: 1 },
    { solicitante: usuarioId, tipo: 'permiso_no_remunerado', estado: 'aprobada', fechaInicio: new Date(), fechaFin: new Date(Date.now() + 86_400_000), diasHabiles: 1 },
  ])

  await Notificacion.insertMany([
    { usuario: usuarioId, categoria: 'danos', titulo: 'Nuevo daño', leida: false },
    { usuario: usuarioId, categoria: 'danos', titulo: 'Otro', leida: true },
  ])
}

describe('calcularResumen en modo soloTarjetas', () => {
  it('devuelve exactamente los mismos contadores que el resumen completo', async () => {
    const id = new mongoose.Types.ObjectId()
    await sembrar(id)
    const usuario = usuarioSuperAdmin(id)

    const completo = await calcularResumen(usuario)
    const ligero = await calcularResumen(usuario, { soloTarjetas: true })

    expect(ligero.tarjetas).toEqual(completo.tarjetas)
  })

  it('los contadores no quedan vacíos: se está comparando algo real', async () => {
    const id = new mongoose.Types.ObjectId()
    await sembrar(id)

    const { tarjetas } = await calcularResumen(usuarioSuperAdmin(id), { soloTarjetas: true })

    expect(tarjetas.danosPendientes).toBe(2)
    expect(tarjetas.ausenciasPendientes).toBe(1)
    expect(tarjetas.notificaciones).toBe(1)
    expect(tarjetas.misTareasMantenimiento).toBe(1)
  })

  it('se salta el trabajo analítico, que es de donde salía la latencia', async () => {
    const id = new mongoose.Types.ObjectId()
    await sembrar(id)

    const ligero = await calcularResumen(usuarioSuperAdmin(id), { soloTarjetas: true })

    // La serie de 7 días son dos agregaciones sobre ReporteDano.
    expect(ligero.flujoSemanal).toEqual([])
    // La cola prioritaria son dos `find` con sort+limit.
    expect(ligero.colaPrioritaria).toEqual([])
    // Las agregaciones de distribución/criticidad quedan en su valor inicial.
    expect(ligero.analitica.distribucionDanos.pendiente).toBe(0)
    expect(ligero.analitica.criticidadDanos.alta).toBe(0)
  })

  it('el dashboard real (sin la opción) sigue trayendo el análisis completo', async () => {
    const id = new mongoose.Types.ObjectId()
    await sembrar(id)

    const completo = await calcularResumen(usuarioSuperAdmin(id))

    // Lo que el copiloto no necesita pero la pantalla sí: la forma del objeto
    // que consume el frontend no puede haber cambiado.
    expect(completo.flujoSemanal).toHaveLength(7)
    expect(completo.analitica.distribucionDanos.pendiente).toBe(1)
    expect(completo.analitica.criticidadDanos.alta).toBe(1)
    expect(completo.colaPrioritaria.length).toBeGreaterThan(0)
    expect(completo.recomendaciones.length).toBeGreaterThan(0)
  })
})
