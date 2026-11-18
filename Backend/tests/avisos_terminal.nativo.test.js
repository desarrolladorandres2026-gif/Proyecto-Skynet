import { describe, it, expect, vi } from 'vitest'
import mongoose from 'mongoose'

import AvisoTerminal from '../src/models/AvisoTerminal.js'
import AvisoTerminalEntrega from '../src/models/AvisoTerminalEntrega.js'
import { registrarConexion } from '../src/utils/streamNativo.js'
import PushSubscription from '../src/models/PushSubscription.js'
import Usuario from '../src/models/Usuario.js'
import { reenviarPendientesNativo, actualizarEstadoEntrega, obtenerDetalle, resumirAudiencia, reenviarAviso } from '../src/modules/avisos_terminal/avisos.service.js'

// Conexión SSE falsa: acumula lo que el backend "escribe" hacia la app Android.
function conexionFalsa() {
  const tramas = []
  return { tramas, res: { write: (t) => tramas.push(t), writableEnded: false, destroyed: false } }
}

async function crearAvisoConEntrega(estado) {
  const usuario = new mongoose.Types.ObjectId()
  const aviso = await AvisoTerminal.create({
    texto: 'Salida de buses suspendida',
    textoLocucion: 'El Terminal de Transportes de Neiva informa que: Salida de buses suspendida',
    destinatarios: { tipo: 'todos', etiqueta: 'Todos' },
    totalDestinatarios: 1,
    creadoPor: { usuario, nombre: 'Admin' },
  })
  const entrega = await AvisoTerminalEntrega.create({ aviso: aviso._id, usuario, estado })
  return { usuario, aviso, entrega }
}

describe('Avisos Terminal -> app Android (SSE)', () => {
  it('al reconectar reenvía por SSE el aviso pendiente con audio, locución y ruta de confirmación', async () => {
    const { usuario, aviso, entrega } = await crearAvisoConEntrega('enviado')
    const { tramas, res } = conexionFalsa()
    const quitar = registrarConexion(String(usuario), 'dispositivo-1', res)

    await reenviarPendientesNativo(usuario, 'dispositivo-1')
    quitar()

    expect(tramas).toHaveLength(1)
    expect(tramas[0].startsWith('event: aviso_terminal\n')).toBe(true)
    const datos = JSON.parse(tramas[0].split('data: ')[1])
    expect(datos.tipo).toBe('aviso_terminal')
    expect(datos.textoLocucion).toContain('Salida de buses suspendida')
    expect(datos.audioUrl).toBe(`/api/avisos-terminal/${aviso._id}/audio`)
    expect(datos.estadoUrl).toBe(`/api/avisos-terminal/entregas/${entrega._id}/estado`)
  })

  it('no vuelve a sonar un aviso que el dispositivo ya confirmó como entregado', async () => {
    const { usuario } = await crearAvisoConEntrega('entregado')
    const { tramas, res } = conexionFalsa()
    const quitar = registrarConexion(String(usuario), 'dispositivo-2', res)

    await reenviarPendientesNativo(usuario, 'dispositivo-2')
    quitar()

    expect(tramas).toHaveLength(0)
  })

  it('el detalle del admin indica por qué canal le llega a cada persona', async () => {
    const { usuario: conApp, aviso } = await crearAvisoConEntrega('enviado')
    const sinApp = new mongoose.Types.ObjectId()
    const soloWeb = new mongoose.Types.ObjectId()
    const caida = new mongoose.Types.ObjectId()
    await Usuario.create([
      { _id: sinApp, nombre_usuario: `a-${sinApp}`, nombre: 'Sin dispositivo', password: 'x', email: `${sinApp}@e.com`, rol: new mongoose.Types.ObjectId() },
      { _id: soloWeb, nombre_usuario: `b-${soloWeb}`, nombre: 'Solo web', password: 'x', email: `${soloWeb}@e.com`, rol: new mongoose.Types.ObjectId() },
      { _id: caida, nombre_usuario: `c-${caida}`, nombre: 'App caída', password: 'x', email: `${caida}@e.com`, rol: new mongoose.Types.ObjectId() },
      { _id: conApp, nombre_usuario: `d-${conApp}`, nombre: 'Con app', password: 'x', email: `${conApp}@e.com`, rol: new mongoose.Types.ObjectId() },
    ])
    await AvisoTerminalEntrega.create([
      { aviso: aviso._id, usuario: sinApp },
      { aviso: aviso._id, usuario: soloWeb },
      { aviso: aviso._id, usuario: caida },
    ])
    await PushSubscription.create([
      { usuario: soloWeb, tipo: 'web', endpoint: `https://push.example/${soloWeb}`, p256dh: 'k', auth: 'a' },
      { usuario: caida, tipo: 'nativo', dispositivoId: 'dev-caida', endpoint: 'nativo:dev-caida' },
      { usuario: conApp, tipo: 'nativo', dispositivoId: 'dev-viva', endpoint: 'nativo:dev-viva' },
    ])
    const quitar = registrarConexion(String(conApp), 'dev-viva', conexionFalsa().res)

    const { entregas } = await obtenerDetalle(String(aviso._id))
    quitar()

    const canalDe = (id) => entregas.find((e) => String(e.usuario?._id) === String(id)).canal
    expect(canalDe(conApp)).toBe('app')
    expect(canalDe(caida)).toBe('app_sin_conexion')
    expect(canalDe(soloWeb)).toBe('web')
    expect(canalDe(sinApp)).toBe('ninguno')
  })

  it('el resumen de audiencia cuenta por canal: app, solo navegador y sin dispositivo', async () => {
    const [a, b, c] = [1, 2, 3].map(() => new mongoose.Types.ObjectId())
    await Usuario.create(
      [a, b, c].map((id, i) => ({ _id: id, nombre_usuario: `r${i}-${id}`, nombre: `U${i}`, password: 'x', email: `${id}@e.com`, rol: new mongoose.Types.ObjectId() }))
    )
    await PushSubscription.create([
      { usuario: a, tipo: 'nativo', dispositivoId: 'res-a', endpoint: 'nativo:res-a' },
      { usuario: a, tipo: 'web', endpoint: `https://push.example/${a}`, p256dh: 'k', auth: 'x' }, // con app Y web: cuenta como app
      { usuario: b, tipo: 'web', endpoint: `https://push.example/${b}`, p256dh: 'k', auth: 'x' },
    ])

    const r = await resumirAudiencia({ tipo: 'usuario', usuarios: [String(a), String(b), String(c)] })

    expect(r).toMatchObject({ total: 3, conApp: 1, soloWeb: 1, sinDispositivo: 1 })
  })

  it('reenviar vuelve a sonar solo a quien no lo escuchó, con una clave de envío nueva', async () => {
    const { usuario: pendiente, aviso, entrega } = await crearAvisoConEntrega('entregado')
    const escucho = new mongoose.Types.ObjectId()
    await AvisoTerminalEntrega.create({ aviso: aviso._id, usuario: escucho, estado: 'reproducido' })
    await PushSubscription.create({ usuario: pendiente, tipo: 'nativo', dispositivoId: 'dev-reenvio', endpoint: 'nativo:dev-reenvio' })
    const { tramas, res } = conexionFalsa()
    const quitar = registrarConexion(String(pendiente), 'dev-reenvio', res)
    const admin = { id_usuario: new mongoose.Types.ObjectId(), nombre_usuario: 'admin', rol: { slug: 'admin' } }

    const r = await reenviarAviso(String(aviso._id), admin)
    await vi.waitFor(() => expect(tramas).toHaveLength(1))
    quitar()

    expect(r.reenviados).toBe(1)
    expect(JSON.parse(tramas[0].split('data: ')[1]).claveEnvio).toBe(`${entrega._id}:1`)
    expect((await AvisoTerminalEntrega.findOne({ aviso: aviso._id, usuario: escucho })).estado).toBe('reproducido')
  })

  it('no se puede reenviar un aviso que ya fue reemplazado por uno más nuevo', async () => {
    const { aviso } = await crearAvisoConEntrega('enviado')
    await new Promise((r) => setTimeout(r, 15))
    await crearAvisoConEntrega('enviado') // más reciente
    const admin = { id_usuario: new mongoose.Types.ObjectId(), nombre_usuario: 'admin', rol: { slug: 'admin' } }

    await expect(reenviarAviso(String(aviso._id), admin)).rejects.toThrow(/más reciente/)
  })

  it('una confirmación tardía no resucita un aviso cancelado por uno más nuevo', async () => {
    const { usuario, entrega } = await crearAvisoConEntrega('cancelado')

    const resultado = await actualizarEstadoEntrega(String(entrega._id), usuario, 'reproducido')

    expect(resultado.estado).toBe('cancelado')
  })
})
