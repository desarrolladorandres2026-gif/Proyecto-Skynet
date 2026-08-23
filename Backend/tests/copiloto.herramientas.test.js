import { describe, expect, it, vi, beforeEach } from 'vitest'

// Se sustituyen las dependencias que salen del proceso (Mongo, servicios de
// otros módulos, red). Lo que se prueba es el REGISTRO DE HERRAMIENTAS: qué se
// le declara al modelo y qué se ejecuta al invocarlo. Si estos tests
// dependieran de la base, un fallo podría venir de cualquier parte.
const moduloActivo = vi.fn(async () => true)
vi.mock('../src/modules/sistema/sistema.service.js', () => ({
  estaModuloActivo: (m) => moduloActivo(m),
}))
vi.mock('../src/modules/operacion/dashboard.service.js', () => ({
  calcularResumen: async () => ({ tarjetas: { misRequerimientos: 2 } }),
}))
vi.mock('../src/modules/requerimientos/requerimientos.service.js', () => ({
  listarMios: async () => [],
  validarItemsCompra: () => {},
  normalizarItemsCompra: (items) => items,
}))
const cancelarAusencia = vi.fn(async (id) => ({ _id: id, estado: 'cancelada' }))
vi.mock('../src/modules/ausencias/ausencias.service.js', () => ({
  listarMias: async () => [
    { _id: 'aus1', tipo: 'vacaciones', estado: 'pendiente', fechaInicio: '2026-03-10', fechaFin: '2026-03-20' },
  ],
  cancelarAusencia: (id, u) => cancelarAusencia(id, u),
}))
// La auditoría se espía: hay que verificar QUÉ se registra y qué no.
const auditar = vi.fn(async () => {})
vi.mock('../src/utils/auditoria.js', () => ({
  registrarAuditoria: (datos) => auditar(datos),
}))
// El servicio de despliegue se simula: aquí solo importa CÓMO se declara la
// herramienta al modelo y quién la recibe, no el envío en sí (eso lo cubre
// copiloto.despliegue.test.js contra Mongo real).
const encolarPruebaComunicaciones = vi.fn(async () => ({ iniciada: true, id: 'j1', mensaje: 'iniciada' }))
const consultarEstadoPrueba = vi.fn(async () => ({ existe: true, estado: 'exito', exitosos: 3, fallidos: 0 }))
const obtenerConfirmacionDespliegue = vi.fn(async () => ({ destinatarios: 47, ejecucionPrevia: null }))
const ejecutarProtocoloDespliegue = vi.fn(async () => ({ estado: 'exito', exitosos: 47, fallidos: 0 }))
vi.mock('../src/modules/copiloto/copiloto.despliegue.js', () => ({
  encolarPruebaComunicaciones: (u) => encolarPruebaComunicaciones(u),
  consultarEstadoPrueba: (u) => consultarEstadoPrueba(u),
  obtenerConfirmacionDespliegue: (u) => obtenerConfirmacionDespliegue(u),
  ejecutarProtocoloDespliegue: (u, o) => ejecutarProtocoloDespliegue(u, o),
}))
const despertarWorkerDespliegue = vi.fn()
vi.mock('../src/modules/copiloto/copiloto.despliegue.worker.js', () => ({
  despertarWorkerDespliegue: () => despertarWorkerDespliegue(),
}))

const { construirHerramientas } = await import('../src/modules/copiloto/copiloto.herramientas.js')

function usuario({ permisos = [], esSuperAdmin = false, rolSlug = 'prueba' } = {}) {
  return {
    id_usuario: 'u1',
    nombre_usuario: 'Prueba',
    esSuperAdmin,
    permisos: new Set(permisos),
    modulos: [],
    rol: { slug: rolSlug },
  }
}

const nombres = (hs) => hs.map((h) => h.declaracion.name)

beforeEach(() => {
  moduloActivo.mockReset()
  moduloActivo.mockResolvedValue(true)
  auditar.mockClear()
  encolarPruebaComunicaciones.mockClear()
  consultarEstadoPrueba.mockClear()
  obtenerConfirmacionDespliegue.mockClear()
  ejecutarProtocoloDespliegue.mockClear()
  despertarWorkerDespliegue.mockClear()
})

describe('qué se le declara al modelo', () => {
  it('incluye las herramientas universales nuevas', async () => {
    const hs = await construirHerramientas(usuario())
    expect(nombres(hs)).toEqual(
      expect.arrayContaining([
        'buscar_en_internet',
        'hora_actual',
        'fecha_actual',
        'calcular',
        'convertir_moneda',
        'abrir_seccion',
      ])
    )
  })

  it('un módulo apagado retira sus herramientas del catálogo', async () => {
    moduloActivo.mockImplementation(async (m) => m !== 'requerimientos')
    const hs = await construirHerramientas(usuario())

    // El modelo no puede invocar lo que nunca vio declarado: esta es la
    // restricción real, no una instrucción del prompt que pudiera ignorar.
    expect(nombres(hs)).not.toContain('mis_requerimientos')
    expect(nombres(hs)).not.toContain('preparar_requerimiento_compra')
    // Las universales no dependen de módulos del ERP.
    expect(nombres(hs)).toContain('calcular')
  })

  it('Bodega no recibe la herramienta de reportes de daño', async () => {
    const hs = await construirHerramientas(usuario({ rolSlug: 'bodega' }))
    expect(nombres(hs)).not.toContain('mis_reportes_dano')
  })

  it('un técnico puro tampoco la recibe', async () => {
    const hs = await construirHerramientas(usuario({ permisos: ['mantenimiento:ejecutar'] }))
    expect(nombres(hs)).not.toContain('mis_reportes_dano')
  })
})

describe('catálogo de navegación embebido en la declaración', () => {
  it('la descripción de abrir_seccion solo lista destinos de ESTE usuario', async () => {
    const hs = await construirHerramientas(usuario())
    const abrir = hs.find((h) => h.declaracion.name === 'abrir_seccion')

    // Es el mecanismo que impide que el modelo le OFREZCA a alguien una
    // sección que no le corresponde: no la ve declarada en ningún momento.
    expect(abrir.declaracion.description).toContain('dashboard')
    expect(abrir.declaracion.description).not.toContain('roles:')
    expect(abrir.declaracion.description).not.toContain('auditoria:')
  })

  it('el Super Admin sí ve los destinos administrativos', async () => {
    const hs = await construirHerramientas(usuario({ esSuperAdmin: true }))
    const abrir = hs.find((h) => h.declaracion.name === 'abrir_seccion')
    expect(abrir.declaracion.description).toContain('roles:')
  })
})

describe('el permiso se verifica al EJECUTAR, no solo al declarar', () => {
  it('abrir_seccion rechaza una clave fuera del alcance del usuario', async () => {
    const hs = await construirHerramientas(usuario())
    const abrir = hs.find((h) => h.declaracion.name === 'abrir_seccion')

    // Aunque el modelo alucine la clave o alguien la inyecte en el texto, aquí
    // se vuelve a resolver contra los permisos reales.
    const r = await abrir.ejecutar({ seccion: 'roles' })
    expect(r.ruta).toBeUndefined()
    expect(r.error).toMatch(/permiso/i)
  })

  it('devuelve la ruta marcada para que el servicio emita el evento de UI', async () => {
    const hs = await construirHerramientas(usuario())
    const abrir = hs.find((h) => h.declaracion.name === 'abrir_seccion')

    const r = await abrir.ejecutar({ seccion: 'dashboard' })
    // `navegacion: true` es lo que lee responderStream para emitir el evento;
    // sin esa marca la navegación no llega nunca al frontend.
    expect(r).toMatchObject({ navegacion: true, ruta: '/dashboard' })
  })
})

describe('auditoría', () => {
  it('registra las acciones de interfaz', async () => {
    const hs = await construirHerramientas(usuario(), { ip: '10.0.0.1' })
    const abrir = hs.find((h) => h.declaracion.name === 'abrir_seccion')
    await abrir.ejecutar({ seccion: 'dashboard' })

    expect(auditar).toHaveBeenCalledTimes(1)
    expect(auditar.mock.calls[0][0]).toMatchObject({
      accion: 'copiloto_herramienta',
      entidad: 'abrir_seccion',
      ip: '10.0.0.1',
      resultado: 'exito',
    })
  })

  it('NO registra las consultas de solo lectura', async () => {
    // Una fila por cada "¿qué tengo pendiente?" ahogaría el registro que se usa
    // para cumplimiento real. La decisión es deliberada, así que se fija.
    const hs = await construirHerramientas(usuario())
    await hs.find((h) => h.declaracion.name === 'resumen_dashboard').ejecutar({})
    await hs.find((h) => h.declaracion.name === 'calcular').ejecutar({ expresion: '2+2' })

    expect(auditar).not.toHaveBeenCalled()
  })
})

describe('acción destructiva y su confirmación', () => {
  it('cancelar_mi_ausencia se declara marcada como que requiere confirmación', async () => {
    const hs = await construirHerramientas(usuario())
    const cancelar = hs.find((h) => h.declaracion.name === 'cancelar_mi_ausencia')

    // Es la bandera que lee responderStream para NO ejecutarla. Si se perdiera
    // al envolver con caché o auditoría, la acción correría sin confirmar.
    expect(cancelar.requiereConfirmacion).toBe(true)
    expect(cancelar.auditar).toBe(true)
  })

  it('la descripción de confirmación dice QUÉ se va a cancelar', async () => {
    // Un "¿confirmas la acción?" sin objeto es lo que hace que la gente pulse
    // que sí por inercia.
    const hs = await construirHerramientas(usuario())
    const cancelar = hs.find((h) => h.declaracion.name === 'cancelar_mi_ausencia')

    const texto = await cancelar.descripcionConfirmacion({ id: 'aus1' })
    expect(texto).toContain('vacaciones')
    expect(texto).toContain('2026-03-10')
    expect(texto).toMatch(/no se puede deshacer/i)
  })

  it('la descripción no revienta si el id no es del usuario', async () => {
    const hs = await construirHerramientas(usuario())
    const cancelar = hs.find((h) => h.declaracion.name === 'cancelar_mi_ausencia')
    // listarMias solo devuelve las propias, así que un id ajeno no aparece.
    await expect(cancelar.descripcionConfirmacion({ id: 'de-otro' })).resolves.toBeTruthy()
  })

  it('desaparece si el módulo de ausencias está apagado', async () => {
    moduloActivo.mockImplementation(async (m) => m !== 'ausencias')
    const hs = await construirHerramientas(usuario())
    expect(nombres(hs)).not.toContain('cancelar_mi_ausencia')
  })
})

describe('protocolo de despliegue — exclusivo Super Admin', () => {
  const NOMBRES_DESPLIEGUE = [
    'ejecutar_prueba_comunicaciones',
    'consultar_estado_prueba_comunicaciones',
    'iniciar_protocolo_despliegue',
  ]

  it('el Super Admin recibe las dos herramientas del protocolo', async () => {
    const hs = await construirHerramientas(usuario({ esSuperAdmin: true }))
    expect(nombres(hs)).toEqual(expect.arrayContaining(NOMBRES_DESPLIEGUE))
  })

  it('nadie más las recibe, ni con permisos administrativos de otros módulos', async () => {
    // No es un permiso RBAC delegable: es el bypass literal de esSuperAdmin,
    // igual que soloAdmin en auth.js. Tener otros permisos no acerca a nadie.
    const hs = await construirHerramientas(usuario({ permisos: ['usuarios:gestionar', 'auditoria:leer'] }))
    for (const nombre of NOMBRES_DESPLIEGUE) expect(nombres(hs)).not.toContain(nombre)
  })

  it('el protocolo oficial exige confirmación; la prueba de comunicaciones no', async () => {
    // La asimetría es deliberada: la prueba es repetible mientras se ajusta el
    // SMTP, el despliegue oficial es irreversible.
    const hs = await construirHerramientas(usuario({ esSuperAdmin: true }))
    const oficial = hs.find((h) => h.declaracion.name === 'iniciar_protocolo_despliegue')
    const prueba = hs.find((h) => h.declaracion.name === 'ejecutar_prueba_comunicaciones')

    expect(oficial.requiereConfirmacion).toBe(true)
    expect(oficial.auditar).toBe(true)
    expect(prueba.requiereConfirmacion).toBeFalsy()
    expect(prueba.auditar).toBe(true)
  })

  it('la descripción de confirmación dice cuántos destinatarios y pide un sí explícito', async () => {
    const hs = await construirHerramientas(usuario({ esSuperAdmin: true }))
    const oficial = hs.find((h) => h.declaracion.name === 'iniciar_protocolo_despliegue')

    const texto = await oficial.descripcionConfirmacion({})
    expect(texto).toContain('47')
    expect(texto).toContain('¿Confirmas el despliegue?')
  })

  it('avisa en la tarjeta si el protocolo ya se había ejecutado antes', async () => {
    obtenerConfirmacionDespliegue.mockResolvedValueOnce({
      destinatarios: 47,
      ejecucionPrevia: { fecha: new Date('2026-08-20T10:00:00Z'), ejecutadoPorNombre: 'admin', exitosos: 47 },
    })
    const hs = await construirHerramientas(usuario({ esSuperAdmin: true }))
    const oficial = hs.find((h) => h.declaracion.name === 'iniciar_protocolo_despliegue')

    const texto = await oficial.descripcionConfirmacion({})
    expect(texto).toMatch(/ya se ejecutó/i)
    expect(texto).toContain('admin')
  })

  it('la prueba de comunicaciones queda auditada', async () => {
    const hs = await construirHerramientas(usuario({ esSuperAdmin: true }), { ip: '10.0.0.9' })
    await hs.find((h) => h.declaracion.name === 'ejecutar_prueba_comunicaciones').ejecutar({})

    expect(encolarPruebaComunicaciones).toHaveBeenCalledTimes(1)
    expect(auditar.mock.calls[0][0]).toMatchObject({
      accion: 'copiloto_herramienta',
      entidad: 'ejecutar_prueba_comunicaciones',
      ip: '10.0.0.9',
      resultado: 'exito',
    })
  })

  it('la herramienta solo ENCOLA y despierta al worker: nunca envía dentro de /chat', async () => {
    const hs = await construirHerramientas(usuario({ esSuperAdmin: true }))
    const resultado = await hs.find((h) => h.declaracion.name === 'ejecutar_prueba_comunicaciones').ejecutar({})

    expect(encolarPruebaComunicaciones).toHaveBeenCalledTimes(1)
    expect(despertarWorkerDespliegue).toHaveBeenCalledTimes(1)
    expect(resultado.iniciada).toBe(true)
  })

  it('si ya había una prueba en curso, no vuelve a despertar al worker', async () => {
    encolarPruebaComunicaciones.mockResolvedValueOnce({ iniciada: false, yaEnCurso: true, id: 'j1' })
    const hs = await construirHerramientas(usuario({ esSuperAdmin: true }))
    await hs.find((h) => h.declaracion.name === 'ejecutar_prueba_comunicaciones').ejecutar({})

    expect(despertarWorkerDespliegue).not.toHaveBeenCalled()
  })

  it('la descripción le prohíbe al modelo inventar conteos al lanzar la prueba', async () => {
    // Como el envío es asíncrono, la herramienta ya no devuelve cifras. Sin
    // esta instrucción el modelo tiende a rellenar el hueco inventándolas.
    const hs = await construirHerramientas(usuario({ esSuperAdmin: true }))
    const prueba = hs.find((h) => h.declaracion.name === 'ejecutar_prueba_comunicaciones')
    expect(prueba.declaracion.description).toMatch(/NO inventes cifras/i)
    expect(prueba.declaracion.description).toMatch(/segundo plano/i)
  })

  it('consultar_estado_prueba_comunicaciones no se audita (es solo lectura)', async () => {
    const hs = await construirHerramientas(usuario({ esSuperAdmin: true }))
    await hs.find((h) => h.declaracion.name === 'consultar_estado_prueba_comunicaciones').ejecutar({})

    expect(consultarEstadoPrueba).toHaveBeenCalledTimes(1)
    expect(auditar).not.toHaveBeenCalled()
  })
})

describe('herramientas puras enchufadas al registro', () => {
  it('calcular devuelve el resultado a través de la herramienta', async () => {
    const hs = await construirHerramientas(usuario())
    const calc = hs.find((h) => h.declaracion.name === 'calcular')
    expect((await calc.ejecutar({ expresion: '19% de 2 millones' })).resultado).toBe(380000)
  })

  it('hora_actual no se cachea (cachearla devolvería una hora incorrecta)', async () => {
    const hs = await construirHerramientas(usuario())
    const hora = hs.find((h) => h.declaracion.name === 'hora_actual')
    const primera = await hora.ejecutar({})
    await new Promise((r) => setTimeout(r, 1100))
    const segunda = await hora.ejecutar({})
    expect(segunda.iso).not.toBe(primera.iso)
  })
})
