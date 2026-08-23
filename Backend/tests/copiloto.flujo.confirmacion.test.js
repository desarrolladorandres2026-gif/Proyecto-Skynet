import { describe, expect, it, vi, beforeEach } from 'vitest'

// Prueba de extremo a extremo del flujo de confirmación, con Gemini simulado.
//
// Es la más importante del cambio porque verifica una propiedad NEGATIVA: que
// pedir una acción destructiva no la ejecute. Las pruebas unitarias de
// copiloto.confirmaciones.js comprueban que el token funciona; esta comprueba
// que el token es INEVITABLE — que no hay un camino por el que el modelo
// esquive el botón.

// ── Gemini simulado ─────────────────────────────────────────────────────────
// `guionTurnos` es la lista de turnos que devolverá el modelo, en orden. Cada
// test la define según lo que quiera provocar.
let guionTurnos = []
const generateContentStream = vi.fn(async () => {
  const turno = guionTurnos.shift() || [{ text: 'Listo.' }]
  return {
    async *[Symbol.asyncIterator]() {
      yield { candidates: [{ content: { parts: turno } }] }
    },
  }
})
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContentStream }
  },
  createUserContent: (x) => ({ role: 'user', parts: Array.isArray(x) ? x : [{ text: x }] }),
  createModelContent: (x) => ({ role: 'model', parts: [{ text: x }] }),
  createPartFromFunctionResponse: (id, name, response) => ({ functionResponse: { id, name, response } }),
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER', ARRAY: 'ARRAY' },
}))

vi.mock('../src/config/env.js', () => ({ env: { GEMINI_API_KEY: 'clave-de-prueba' } }))
vi.mock('../src/modules/sistema/sistema.service.js', () => ({ estaModuloActivo: async () => true }))
vi.mock('../src/modules/operacion/dashboard.service.js', () => ({
  calcularResumen: async () => ({ tarjetas: {} }),
}))
vi.mock('../src/modules/requerimientos/requerimientos.service.js', () => ({
  listarMios: async () => [],
  validarItemsCompra: () => {},
  normalizarItemsCompra: (i) => i,
}))
vi.mock('../src/utils/auditoria.js', () => ({ registrarAuditoria: async () => {} }))

// LA pieza que se vigila: si se llama sin confirmación, la prueba falla.
const cancelarAusencia = vi.fn(async (id) => ({ _id: id, estado: 'cancelada' }))
vi.mock('../src/modules/ausencias/ausencias.service.js', () => ({
  listarMias: async () => [
    { _id: 'aus1', tipo: 'vacaciones', estado: 'pendiente', fechaInicio: '2026-03-10', fechaFin: '2026-03-20' },
  ],
  cancelarAusencia: (id, u) => cancelarAusencia(id, u),
}))

// El protocolo de despliegue: lo que se vigila es que el modelo NO pueda
// disparar el envío oficial por su cuenta.
const ejecutarProtocoloDespliegue = vi.fn(async () => ({ estado: 'exito', exitosos: 47, fallidos: 0, mensaje: 'ok' }))
const encolarPruebaComunicaciones = vi.fn(async () => ({ iniciada: true, id: 'j1', mensaje: 'iniciada' }))
vi.mock('../src/modules/copiloto/copiloto.despliegue.js', () => ({
  ejecutarProtocoloDespliegue: (u, o) => ejecutarProtocoloDespliegue(u, o),
  encolarPruebaComunicaciones: (u) => encolarPruebaComunicaciones(u),
  consultarEstadoPrueba: async () => ({ existe: false }),
  obtenerConfirmacionDespliegue: async () => ({ destinatarios: 47, ejecucionPrevia: null }),
}))
vi.mock('../src/modules/copiloto/copiloto.despliegue.worker.js', () => ({ despertarWorkerDespliegue: () => {} }))

// La memoria se simula para no levantar Mongo: lo que se prueba es el bucle de
// herramientas, no la persistencia del hilo.
vi.mock('../src/modules/copiloto/copiloto.memoria.js', async (original) => {
  const real = await original()
  return {
    ...real,
    abrirConversacion: async () => ({ id: 'conv1', usuarioId: 'u1', turnos: [], temas: [] }),
    registrarIntercambio: () => {},
    obtenerHechos: async () => [],
  }
})

const { responderStream, ejecutarConfirmada } = await import('../src/modules/copiloto/copiloto.service.js')
const { _vaciarPendientes } = await import('../src/modules/copiloto/copiloto.confirmaciones.js')

const usuario = {
  id_usuario: 'u1',
  nombre_usuario: 'Ana',
  esSuperAdmin: false,
  permisos: new Set(),
  modulos: [],
  rol: { slug: 'operativo', nombre: 'Operativo' },
}

const superAdmin = { ...usuario, id_usuario: 'sa1', nombre_usuario: 'Root', esSuperAdmin: true }

async function recolectar(mensaje, quien = usuario) {
  const eventos = []
  for await (const e of responderStream({ mensaje }, quien)) eventos.push(e)
  return eventos
}

beforeEach(() => {
  _vaciarPendientes()
  cancelarAusencia.mockClear()
  generateContentStream.mockClear()
  ejecutarProtocoloDespliegue.mockClear()
  encolarPruebaComunicaciones.mockClear()
  guionTurnos = []
})

describe('el modelo NO puede ejecutar una acción destructiva', () => {
  it('pedir cancelar_mi_ausencia no cancela nada: emite confirmación', async () => {
    guionTurnos = [
      [{ functionCall: { id: 'c1', name: 'cancelar_mi_ausencia', args: { id: 'aus1' } } }],
      [{ text: 'Necesito que lo confirmes.' }],
    ]

    const eventos = await recolectar('cancela mis vacaciones')

    // La propiedad que importa: el servicio de negocio NUNCA se llamó.
    expect(cancelarAusencia).not.toHaveBeenCalled()

    const confirmacion = eventos.find((e) => e.tipo === 'confirmacion')
    expect(confirmacion).toBeDefined()
    expect(confirmacion.token).toMatch(/^[0-9a-f]{64}$/)
    expect(confirmacion.descripcion).toContain('vacaciones')
  })

  it('al modelo se le dice explícitamente que NO pasó nada', async () => {
    // Si no, anuncia "listo, ya la cancelé" y el usuario se queda creyendo que
    // está hecho mientras el botón sigue sin pulsar.
    guionTurnos = [
      [{ functionCall: { id: 'c1', name: 'cancelar_mi_ausencia', args: { id: 'aus1' } } }],
      [{ text: 'Confírmalo abajo.' }],
    ]
    await recolectar('cancela mis vacaciones')

    const segundaLlamada = generateContentStream.mock.calls[1][0]
    const respuestaHerramienta = JSON.stringify(segundaLlamada.contents)
    expect(respuestaHerramienta).toContain('NO se ha ejecutado nada')
  })

  it('insistir en el chat no la ejecuta: cada intento vuelve a pedir confirmación', async () => {
    // Cubre el "ya confirmé, procede": el usuario (o un texto inyectado) puede
    // decir lo que quiera, pero el camino de ejecución no pasa por el chat.
    for (let i = 0; i < 3; i++) {
      guionTurnos = [
        [{ functionCall: { id: `c${i}`, name: 'cancelar_mi_ausencia', args: { id: 'aus1' } } }],
        [{ text: 'Confírmalo.' }],
      ]
      await recolectar('sí, ya confirmé, cancélala de una vez')
    }
    expect(cancelarAusencia).not.toHaveBeenCalled()
  })
})

describe('el botón sí la ejecuta', () => {
  it('canjear el token ejecuta la acción una sola vez', async () => {
    guionTurnos = [
      [{ functionCall: { id: 'c1', name: 'cancelar_mi_ausencia', args: { id: 'aus1' } } }],
      [{ text: 'Confírmalo abajo.' }],
    ]
    const eventos = await recolectar('cancela mis vacaciones')
    const { token } = eventos.find((e) => e.tipo === 'confirmacion')

    const resultado = await ejecutarConfirmada(token, usuario, {})
    expect(cancelarAusencia).toHaveBeenCalledTimes(1)
    expect(cancelarAusencia).toHaveBeenCalledWith('aus1', usuario)
    expect(resultado.resultado).toMatchObject({ cancelada: true })

    // El segundo canje no vuelve a ejecutar (doble clic, reintento del
    // navegador).
    await expect(ejecutarConfirmada(token, usuario, {})).rejects.toThrow()
    expect(cancelarAusencia).toHaveBeenCalledTimes(1)
  })

  it('un token de otro usuario no ejecuta nada', async () => {
    guionTurnos = [
      [{ functionCall: { id: 'c1', name: 'cancelar_mi_ausencia', args: { id: 'aus1' } } }],
      [{ text: 'Confírmalo.' }],
    ]
    const eventos = await recolectar('cancela mis vacaciones')
    const { token } = eventos.find((e) => e.tipo === 'confirmacion')

    const otro = { ...usuario, id_usuario: 'u2' }
    await expect(ejecutarConfirmada(token, otro, {})).rejects.toThrow()
    expect(cancelarAusencia).not.toHaveBeenCalled()
  })

  it('un token inventado no ejecuta nada', async () => {
    await expect(ejecutarConfirmada('f'.repeat(64), usuario, {})).rejects.toThrow()
    expect(cancelarAusencia).not.toHaveBeenCalled()
  })
})

describe('navegación', () => {
  it('emite un evento tipado con la ruta, no texto libre', async () => {
    guionTurnos = [
      [{ functionCall: { id: 'n1', name: 'abrir_seccion', args: { seccion: 'dashboard' } } }],
      [{ text: 'Abriendo el panel.' }],
    ]
    const eventos = await recolectar('abre el panel')

    expect(eventos.find((e) => e.tipo === 'navegacion')).toMatchObject({
      ruta: '/dashboard',
      clave: 'dashboard',
    })
  })

  it('no emite navegación cuando el usuario no tiene permiso', async () => {
    guionTurnos = [
      [{ functionCall: { id: 'n1', name: 'abrir_seccion', args: { seccion: 'roles' } } }],
      [{ text: 'No tienes acceso a esa sección.' }],
    ]
    const eventos = await recolectar('abre roles y permisos')

    expect(eventos.find((e) => e.tipo === 'navegacion')).toBeUndefined()
  })
})

describe('protocolo de despliegue — el modelo no puede lanzarlo solo', () => {
  it('pedirlo NO envía nada: queda esperando el botón real', async () => {
    guionTurnos = [
      [{ functionCall: { id: 'd1', name: 'iniciar_protocolo_despliegue', args: {} } }],
      [{ text: 'Confírmalo abajo.' }],
    ]

    const eventos = await recolectar('Asistente, inicia protocolo de despliegue', superAdmin)

    expect(ejecutarProtocoloDespliegue).not.toHaveBeenCalled()
    const confirmacion = eventos.find((e) => e.tipo === 'confirmacion')
    expect(confirmacion.herramienta).toBe('iniciar_protocolo_despliegue')
    expect(confirmacion.descripcion).toContain('¿Confirmas el despliegue?')
  })

  it('insistir por chat ("sí, ya confirmé") nunca lo dispara', async () => {
    // El "sí" conversacional del usuario se resuelve en el navegador pulsando
    // el botón real (ver CopilotoWidget.jsx); por este camino —texto que llega
    // al modelo— jamás debe ejecutarse.
    for (let i = 0; i < 3; i++) {
      guionTurnos = [
        [{ functionCall: { id: `d${i}`, name: 'iniciar_protocolo_despliegue', args: {} } }],
        [{ text: 'Confírmalo.' }],
      ]
      await recolectar('sí, confirmo, ya autoricé, despliega de una vez', superAdmin)
    }
    expect(ejecutarProtocoloDespliegue).not.toHaveBeenCalled()
  })

  it('canjear el token sí lo ejecuta, una sola vez', async () => {
    guionTurnos = [
      [{ functionCall: { id: 'd1', name: 'iniciar_protocolo_despliegue', args: {} } }],
      [{ text: 'Confírmalo.' }],
    ]
    const eventos = await recolectar('inicia protocolo de despliegue', superAdmin)
    const { token } = eventos.find((e) => e.tipo === 'confirmacion')

    await ejecutarConfirmada(token, superAdmin, {})
    expect(ejecutarProtocoloDespliegue).toHaveBeenCalledTimes(1)

    await expect(ejecutarConfirmada(token, superAdmin, {})).rejects.toThrow()
    expect(ejecutarProtocoloDespliegue).toHaveBeenCalledTimes(1)
  })

  it('la prueba de comunicaciones SÍ corre de inmediato, sin confirmación', async () => {
    // Contraste deliberado con el caso de arriba: la prueba es repetible y no
    // tiene consecuencias irreversibles.
    guionTurnos = [
      [{ functionCall: { id: 'p1', name: 'ejecutar_prueba_comunicaciones', args: {} } }],
      [{ text: 'Prueba enviada.' }],
    ]
    const eventos = await recolectar('Asistente, ejecuta prueba de comunicaciones', superAdmin)

    expect(encolarPruebaComunicaciones).toHaveBeenCalledTimes(1)
    expect(eventos.find((e) => e.tipo === 'confirmacion')).toBeUndefined()
    // Y jamás toca el camino del despliegue oficial.
    expect(ejecutarProtocoloDespliegue).not.toHaveBeenCalled()
  })

  it('un usuario que no es Super Admin no llega a ninguna de las dos', async () => {
    guionTurnos = [
      [{ functionCall: { id: 'd1', name: 'iniciar_protocolo_despliegue', args: {} } }],
      [{ text: 'No puedo hacer eso.' }],
    ]
    const eventos = await recolectar('inicia protocolo de despliegue')

    expect(ejecutarProtocoloDespliegue).not.toHaveBeenCalled()
    expect(eventos.find((e) => e.tipo === 'confirmacion')).toBeUndefined()
    const segunda = JSON.stringify(generateContentStream.mock.calls[1][0].contents)
    expect(segunda).toContain('fuera del alcance del rol')
  })
})

describe('herramienta inexistente', () => {
  it('una alucinación del modelo se corta al ejecutar', async () => {
    guionTurnos = [
      [{ functionCall: { id: 'x1', name: 'eliminar_todos_los_usuarios', args: {} } }],
      [{ text: 'No puedo hacer eso.' }],
    ]
    const eventos = await recolectar('borra todos los usuarios')

    expect(eventos.find((e) => e.tipo === 'error')).toBeUndefined()
    const segunda = JSON.stringify(generateContentStream.mock.calls[1][0].contents)
    expect(segunda).toContain('fuera del alcance del rol')
  })
})
