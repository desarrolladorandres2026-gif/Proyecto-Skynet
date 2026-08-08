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
