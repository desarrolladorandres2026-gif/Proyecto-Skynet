import { describe, expect, it, vi, beforeEach } from 'vitest'
import mongoose from 'mongoose'

import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import RegistroDespliegue from '../src/models/RegistroDespliegue.js'
import { hashPassword } from '../src/utils/password.js'

// Se sustituye el envío real: lo que se prueba aquí es la lógica de
// resolución de destinatarios, el tally de éxitos/fallos y el compare-and-
// swap contra envíos oficiales duplicados — no el SMTP en sí (eso ya lo cubre
// la infraestructura de utils/email.js).
const enviarEmailGenerico = vi.fn().mockResolvedValue(undefined)
const verificarConfiguracionEmail = vi.fn().mockResolvedValue(undefined)
vi.mock('../src/utils/email.js', () => ({
  enviarEmailGenerico: (...args) => enviarEmailGenerico(...args),
  verificarConfiguracionEmail: (...args) => verificarConfiguracionEmail(...args),
}))

const {
  encolarPruebaComunicaciones,
  procesarPruebasPendientes,
  consultarEstadoPrueba,
  obtenerConfirmacionDespliegue,
  ejecutarProtocoloDespliegue,
} = await import('../src/modules/copiloto/copiloto.despliegue.js')

// Encolar + procesar, que es lo que hace el flujo real (la herramienta encola
// y despierta al worker). Se mantiene como helper para los casos que solo
// quieren comprobar el RESULTADO del envío, no el reparto entre las dos fases.
async function pruebaCompleta(quien) {
  const encolado = await encolarPruebaComunicaciones(quien)
  await procesarPruebasPendientes()
  return { encolado, estado: await consultarEstadoPrueba(quien) }
}

function actor({ esSuperAdmin = true } = {}) {
  return { id_usuario: new mongoose.Types.ObjectId(), nombre_usuario: 'admin-prueba', esSuperAdmin }
}

async function crearRolBasico() {
  const sufijo = Math.random().toString(36).slice(2)
  return Rol.create({ nombre: `Rol-${sufijo}`, slug: `rol-${sufijo}`, esSuperAdmin: false, ambito: 'global', permisos: [] })
}

async function crearUsuario(rol, extra = {}) {
  const sufijo = Math.random().toString(36).slice(2)
  return Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Usuario Prueba',
    email: `${sufijo}@example.com`,
    password: await hashPassword('Clave.Segura.2026'),
    rol: rol._id,
    estado: 'activo',
    ...extra,
  })
}

// Bypassa la validación de Mongoose (`Usuario.email` exige EMAIL_REGEX a
// nivel de schema) para simular el escenario real que justifica volver a
// filtrar en JS: datos que entraron sin pasar por ahí (migración, script,
// escritura directa a la colección) — ver el comentario de
// obtenerDestinatarios() en copiloto.despliegue.js.
async function crearUsuarioCorreoInvalido(rol) {
  const sufijo = Math.random().toString(36).slice(2)
  await Usuario.collection.insertOne({
    nombre_usuario: `user-${sufijo}`,
    nombre: 'Usuario Correo Malo',
    email: 'esto-no-es-un-correo',
    password: 'x',
    rol: rol._id,
    estado: 'activo',
    modulos: [],
  })
}

beforeEach(() => {
  enviarEmailGenerico.mockReset().mockResolvedValue(undefined)
  verificarConfiguracionEmail.mockReset().mockResolvedValue(undefined)
})

describe('resolución de destinatarios', () => {
  it('incluye activos con correo válido, excluye inactivos y correos inválidos, e incluye esPrueba:true', async () => {
    const rol = await crearRolBasico()
    await crearUsuario(rol) // activo, correo válido -> cuenta
    await crearUsuario(rol, { estado: 'inactivo' }) // excluido
    await crearUsuario(rol, { esPrueba: true }) // sigue siendo personal real -> cuenta
    await crearUsuarioCorreoInvalido(rol) // excluido, cuenta como sinCorreo

    const { estado } = await pruebaCompleta(actor())

    expect(estado.totalDestinatarios).toBe(2)
    expect(estado.sinCorreo).toBe(1)
    expect(enviarEmailGenerico).toHaveBeenCalledTimes(2)
  })
})

describe('prueba de comunicaciones — ENCOLADO (lo que corre dentro de /chat)', () => {
  it('encolar NO envía ni un correo ni toca el SMTP: solo deja el trabajo anotado', async () => {
    // Esta es LA propiedad del cambio: /chat ya no espera al SMTP. Antes,
    // este mismo camino hacía el pre-flight (~1 s, pico de 11 s) más N envíos.
    const rol = await crearRolBasico()
    for (let i = 0; i < 5; i++) await crearUsuario(rol)

    const resultado = await encolarPruebaComunicaciones(actor())

    expect(resultado.iniciada).toBe(true)
    expect(enviarEmailGenerico).not.toHaveBeenCalled()
    expect(verificarConfiguracionEmail).not.toHaveBeenCalled()
    expect(resultado.mensaje).toMatch(/segundo plano/i)
  })

  it('encolar deja el trabajo en estado pendiente (2 saltos a Mongo: dedupe + alta)', async () => {
    const rol = await crearRolBasico()
    await crearUsuario(rol)
    const quien = actor()

    await encolarPruebaComunicaciones(quien)

    const registros = await RegistroDespliegue.find({ tipo: 'prueba' })
    expect(registros).toHaveLength(1)
    expect(registros[0].estado).toBe('pendiente')
    expect(registros[0].ejecutadoPorNombre).toBe(quien.nombre_usuario)
  })

  it('rechaza a quien no es Super Admin sin encolar nada', async () => {
    await expect(encolarPruebaComunicaciones(actor({ esSuperAdmin: false }))).rejects.toThrow(/Super Admin/)
    expect(await RegistroDespliegue.countDocuments({})).toBe(0)
  })

  it('repetir la orden no encola un segundo lote (protección contra doble ejecución)', async () => {
    const rol = await crearRolBasico()
    await crearUsuario(rol)

    const primera = await encolarPruebaComunicaciones(actor())
    const segunda = await encolarPruebaComunicaciones(actor())

    expect(primera.iniciada).toBe(true)
    expect(segunda.iniciada).toBe(false)
    expect(segunda.yaEnCurso).toBe(true)
    expect(segunda.id).toBe(primera.id)
    expect(await RegistroDespliegue.countDocuments({ tipo: 'prueba' })).toBe(1)

    // Y al procesar, se envía UNA sola vez a cada destinatario.
    await procesarPruebasPendientes()
    expect(enviarEmailGenerico).toHaveBeenCalledTimes(1)
  })
})

describe('prueba de comunicaciones — WORKER (lo que corre en segundo plano)', () => {
  it('el worker sí ejecuta los envíos reales y valida el SMTP', async () => {
    const rol = await crearRolBasico()
    for (let i = 0; i < 3; i++) await crearUsuario(rol)
    await encolarPruebaComunicaciones(actor())

    const procesados = await procesarPruebasPendientes()

    expect(procesados).toBe(1)
    expect(verificarConfiguracionEmail).toHaveBeenCalledTimes(1)
    expect(enviarEmailGenerico).toHaveBeenCalledTimes(3)
  })

  it('sin trabajos pendientes, un ciclo del worker no hace nada', async () => {
    expect(await procesarPruebasPendientes()).toBe(0)
    expect(enviarEmailGenerico).not.toHaveBeenCalled()
  })

  it('error de configuración SMTP: no envía nada y deja el motivo registrado', async () => {
    verificarConfiguracionEmail.mockRejectedValueOnce(new Error('ECONNREFUSED'))
    const rol = await crearRolBasico()
    await crearUsuario(rol)
    const quien = actor()
    await encolarPruebaComunicaciones(quien)

    await procesarPruebasPendientes()

    expect(enviarEmailGenerico).not.toHaveBeenCalled()
    const estado = await consultarEstadoPrueba(quien)
    expect(estado.estado).toBe('error')
    expect(estado.mensaje).toMatch(/no está configurado correctamente/)
    expect(estado.mensaje).toMatch(/ECONNREFUSED/)
  })

  it('un fallo individual no detiene el lote y nunca se reporta éxito', async () => {
    const rol = await crearRolBasico()
    const falla = await crearUsuario(rol)
    await crearUsuario(rol)
    await crearUsuario(rol)
    enviarEmailGenerico.mockImplementation(async ({ to }) => {
      if (to === falla.email) throw new Error('rebote simulado')
    })
    const quien = actor()

    const { estado } = await pruebaCompleta(quien)

    expect(enviarEmailGenerico).toHaveBeenCalledTimes(3) // se intentó con TODOS
    expect(estado.exitosos).toBe(2)
    expect(estado.fallidos).toBe(1)
    expect(estado.estado).toBe('parcial')
    expect(estado.mensaje).toMatch(/CON ERRORES/)

    // El motivo del fallo queda guardado, no solo el conteo.
    const registro = await RegistroDespliegue.findOne({ tipo: 'prueba' })
    expect(registro.detalleFallos).toHaveLength(1)
    expect(registro.detalleFallos[0].email).toBe(falla.email)
    expect(registro.detalleFallos[0].error).toMatch(/rebote simulado/)
  })

  it('si TODOS fallan, el estado es error y jamás "exito"', async () => {
    const rol = await crearRolBasico()
    await crearUsuario(rol)
    await crearUsuario(rol)
    enviarEmailGenerico.mockRejectedValue(new Error('SMTP rechaza'))

    const { estado } = await pruebaCompleta(actor())
    expect(estado.estado).toBe('error')
    expect(estado.exitosos).toBe(0)
    expect(estado.fallidos).toBe(2)
  })

  it('47 destinatarios: los procesa todos, una sola vez cada uno', async () => {
    const rol = await crearRolBasico()
    for (let i = 0; i < 47; i++) await crearUsuario(rol)

    const { estado } = await pruebaCompleta(actor())

    expect(estado.totalDestinatarios).toBe(47)
    expect(estado.exitosos).toBe(47)
    expect(estado.estado).toBe('exito')
    expect(enviarEmailGenerico).toHaveBeenCalledTimes(47)
    // Ni un destinatario repetido.
    const destinos = enviarEmailGenerico.mock.calls.map(([a]) => a.to)
    expect(new Set(destinos).size).toBe(47)
  })

  it('el asunto es SIEMPRE el de prueba: nunca puede salir el correo oficial', async () => {
    const rol = await crearRolBasico()
    await crearUsuario(rol)
    await crearUsuario(rol)

    await pruebaCompleta(actor())

    for (const [args] of enviarEmailGenerico.mock.calls) {
      expect(args.subject).toBe('[PRUEBA] Skynet — Verificación de comunicaciones')
    }
  })

  it('sin destinatarios elegibles, lo reporta sin intentar ningún envío', async () => {
    const { estado } = await pruebaCompleta(actor())
    expect(estado.estado).toBe('sin_destinatarios')
    expect(enviarEmailGenerico).not.toHaveBeenCalled()
  })

  it('dos ciclos del worker no reenvían un trabajo ya terminado', async () => {
    const rol = await crearRolBasico()
    await crearUsuario(rol)
    await encolarPruebaComunicaciones(actor())

    await procesarPruebasPendientes()
    await procesarPruebasPendientes()

    expect(enviarEmailGenerico).toHaveBeenCalledTimes(1)
  })

  it('reanuda tras una caída sin reenviar a quien ya recibió', async () => {
    // Simula el proceso muerto a mitad del lote: 2 de 5 enviados y el
    // trabajo abandonado en 'procesando' con el reclamo ya vencido.
    const rol = await crearRolBasico()
    for (let i = 0; i < 5; i++) await crearUsuario(rol)
    await encolarPruebaComunicaciones(actor())

    let llamadas = 0
    enviarEmailGenerico.mockImplementation(async () => {
      llamadas += 1
      if (llamadas > 2) throw Object.assign(new Error('proceso caído'), { fatal: true })
    })
    await expect(procesarPruebasPendientes()).resolves.toBeDefined()

    const aMitad = await RegistroDespliegue.findOne({ tipo: 'prueba' })
    // Se rebobina el estado a "el proceso murió con el reclamo tomado".
    await RegistroDespliegue.updateOne(
      { _id: aMitad._id },
      { $set: { estado: 'procesando', cursor: 2, exitosos: 2, fallidos: 0, detalleFallos: [], procesandoDesde: new Date(Date.now() - 60 * 60 * 1000) } }
    )

    enviarEmailGenerico.mockReset().mockResolvedValue(undefined)
    await procesarPruebasPendientes()

    // Solo los 3 que faltaban, no los 5.
    expect(enviarEmailGenerico).toHaveBeenCalledTimes(3)
    const final = await RegistroDespliegue.findOne({ _id: aMitad._id })
    expect(final.estado).toBe('exito')
    expect(final.exitosos).toBe(5)
  })

  it('no roba un trabajo que otro worker acaba de reclamar', async () => {
    const rol = await crearRolBasico()
    await crearUsuario(rol)
    await encolarPruebaComunicaciones(actor())
    // Reclamo fresco de "otro proceso": aún no venció, así que este ciclo
    // debe ignorarlo por completo.
    await RegistroDespliegue.updateOne({ tipo: 'prueba' }, { $set: { estado: 'procesando', procesandoDesde: new Date() } })

    expect(await procesarPruebasPendientes()).toBe(0)
    expect(enviarEmailGenerico).not.toHaveBeenCalled()
  })
})

describe('consultarEstadoPrueba', () => {
  it('exige Super Admin', async () => {
    await expect(consultarEstadoPrueba(actor({ esSuperAdmin: false }))).rejects.toThrow(/Super Admin/)
  })

  it('sin ninguna prueba previa lo dice claramente', async () => {
    const estado = await consultarEstadoPrueba(actor())
    expect(estado.existe).toBe(false)
  })

  it('refleja el progreso mientras el lote está en curso', async () => {
    const rol = await crearRolBasico()
    for (let i = 0; i < 4; i++) await crearUsuario(rol)
    await encolarPruebaComunicaciones(actor())
    await RegistroDespliegue.updateOne(
      { tipo: 'prueba' },
      { $set: { estado: 'procesando', cursor: 2, exitosos: 2, totalDestinatarios: 4 } }
    )

    const estado = await consultarEstadoPrueba(actor())
    expect(estado.estado).toBe('procesando')
    expect(estado.mensaje).toMatch(/EN CURSO/)
    expect(estado.mensaje).toContain('2 de 4')
  })

  it('devuelve los conteos exactos al terminar', async () => {
    const rol = await crearRolBasico()
    for (let i = 0; i < 3; i++) await crearUsuario(rol)
    const quien = actor()

    const { estado } = await pruebaCompleta(quien)
    expect(estado).toMatchObject({ existe: true, estado: 'exito', exitosos: 3, fallidos: 0, totalDestinatarios: 3 })
  })
})

describe('obtenerConfirmacionDespliegue', () => {
  it('reporta el conteo de destinatarios y ninguna ejecución previa si no hay una', async () => {
    const rol = await crearRolBasico()
    await crearUsuario(rol)

    const info = await obtenerConfirmacionDespliegue(actor())
    expect(info.destinatarios).toBe(1)
    expect(info.ejecucionPrevia).toBeNull()
  })

  it('reporta la ejecución oficial previa cuando existe', async () => {
    const previo = actor()
    await RegistroDespliegue.create({
      tipo: 'oficial',
      reclamado: true,
      estado: 'exito',
      ejecutadoPor: previo.id_usuario,
      ejecutadoPorNombre: previo.nombre_usuario,
      exitosos: 3,
    })

    const info = await obtenerConfirmacionDespliegue(actor())
    expect(info.ejecucionPrevia).toMatchObject({ ejecutadoPorNombre: previo.nombre_usuario, exitosos: 3 })
  })
})

describe('ejecutarProtocoloDespliegue', () => {
  it('rechaza a quien no es Super Admin sin enviar nada', async () => {
    await expect(ejecutarProtocoloDespliegue(actor({ esSuperAdmin: false }))).rejects.toThrow(/Super Admin/)
    expect(enviarEmailGenerico).not.toHaveBeenCalled()
  })

  it('primer envío: manda a todos los elegibles y queda reclamado', async () => {
    const rol = await crearRolBasico()
    await crearUsuario(rol)
    await crearUsuario(rol)

    const resultado = await ejecutarProtocoloDespliegue(actor())

    expect(resultado.estado).toBe('exito')
    expect(resultado.exitosos).toBe(2)
    const registro = await RegistroDespliegue.findOne({ tipo: 'oficial' })
    expect(registro.reclamado).toBe(true)
    for (const [args] of enviarEmailGenerico.mock.calls) {
      expect(args.subject).toBe('🚀 Skynet ha sido desplegado — Tu acceso ya está disponible')
    }
  })

  it('una segunda ejecución sin forzar es rechazada y no reenvía nada', async () => {
    const rol = await crearRolBasico()
    await crearUsuario(rol)
    await ejecutarProtocoloDespliegue(actor())
    enviarEmailGenerico.mockClear()

    await expect(ejecutarProtocoloDespliegue(actor())).rejects.toThrow(/ya se ejecutó/)
    expect(enviarEmailGenerico).not.toHaveBeenCalled()
    expect(await RegistroDespliegue.countDocuments({ tipo: 'oficial' })).toBe(1)
  })

  it('con forzar:true, reenvía y crea un segundo registro', async () => {
    const rol = await crearRolBasico()
    await crearUsuario(rol)
    await ejecutarProtocoloDespliegue(actor())
    enviarEmailGenerico.mockClear()

    const resultado = await ejecutarProtocoloDespliegue(actor(), { forzar: true })

    expect(resultado.estado).toBe('exito')
    expect(enviarEmailGenerico).toHaveBeenCalledTimes(1)
    expect(await RegistroDespliegue.countDocuments({ tipo: 'oficial' })).toBe(2)
  })

  it('una corrida previa que falló por completo (reclamado:false) no bloquea un reintento sin forzar', async () => {
    const rol = await crearRolBasico()
    await crearUsuario(rol)
    verificarConfiguracionEmail.mockRejectedValueOnce(new Error('SMTP caído'))
    await expect(ejecutarProtocoloDespliegue(actor())).rejects.toThrow(/no está configurado correctamente/)
    expect(enviarEmailGenerico).not.toHaveBeenCalled()

    // El intento anterior falló ANTES de reclamar nada (el preflight corre
    // antes del compare-and-swap), así que este segundo intento, ya con el
    // correo "arreglado", no debería necesitar forzar.
    const resultado = await ejecutarProtocoloDespliegue(actor())
    expect(resultado.estado).toBe('exito')
  })

  it('si TODOS los destinatarios fallan, libera el slot en vez de dejarlo reclamado', async () => {
    const rol = await crearRolBasico()
    await crearUsuario(rol)
    enviarEmailGenerico.mockRejectedValue(new Error('rebote simulado'))

    const resultado = await ejecutarProtocoloDespliegue(actor())
    expect(resultado.estado).toBe('error')

    enviarEmailGenerico.mockResolvedValue(undefined)
    // Sin forzar: si el slot no se hubiera liberado, esto lanzaría "ya se ejecutó".
    const segundo = await ejecutarProtocoloDespliegue(actor())
    expect(segundo.estado).toBe('exito')
  })

  it('sin destinatarios elegibles, no reclama el slot ni envía nada', async () => {
    const resultado = await ejecutarProtocoloDespliegue(actor())
    expect(resultado.estado).toBe('sin_destinatarios')
    expect(enviarEmailGenerico).not.toHaveBeenCalled()

    const rol = await crearRolBasico()
    await crearUsuario(rol)
    const segundo = await ejecutarProtocoloDespliegue(actor())
    expect(segundo.estado).toBe('exito')
  })

  it('dos confirmaciones simultáneas: solo una envía, la otra es rechazada (compare-and-swap real)', async () => {
    await RegistroDespliegue.init() // asegura que el índice único parcial ya esté construido
    const rol = await crearRolBasico()
    await crearUsuario(rol)
    await crearUsuario(rol)

    const [r1, r2] = await Promise.allSettled([ejecutarProtocoloDespliegue(actor()), ejecutarProtocoloDespliegue(actor())])
    const estados = [r1.status, r2.status]

    expect(estados.filter((s) => s === 'fulfilled')).toHaveLength(1)
    expect(estados.filter((s) => s === 'rejected')).toHaveLength(1)
    // Exactamente UNA tanda completa (2 destinatarios), nunca el doble.
    expect(enviarEmailGenerico).toHaveBeenCalledTimes(2)
    expect(await RegistroDespliegue.countDocuments({ tipo: 'oficial' })).toBe(1)
  })
})
