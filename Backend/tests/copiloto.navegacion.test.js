import { describe, expect, it, vi, beforeEach } from 'vitest'

// `estaModuloActivo` consulta la configuración del sistema en Mongo. Se
// sustituye porque lo que se prueba aquí es el FILTRO DE PERMISOS, no la
// persistencia: mezclar las dos cosas haría que un fallo de este archivo
// pudiera venir de cualquiera de las dos.
const moduloActivo = vi.fn(async () => true)
vi.mock('../src/modules/sistema/sistema.service.js', () => ({
  estaModuloActivo: (m) => moduloActivo(m),
}))

const { destinosDisponibles, resolverDestino, CATALOGO_DESTINOS } = await import(
  '../src/modules/copiloto/copiloto.navegacion.js'
)

// Réplica mínima de lo que arma middleware/auth.js en req.usuario. `permisos`
// es un Set, no un array: si se cambiara a array, `.has()` devolvería
// undefined y TODOS los destinos con permiso quedarían fuera en silencio.
function usuario({ permisos = [], esSuperAdmin = false, modulos = [] } = {}) {
  return {
    id_usuario: 'u1',
    nombre_usuario: 'Prueba',
    esSuperAdmin,
    permisos: new Set(permisos),
    modulos,
    rol: { slug: 'prueba' },
  }
}

beforeEach(() => {
  moduloActivo.mockReset()
  moduloActivo.mockResolvedValue(true)
})

describe('filtrado por permisos', () => {
  it('un usuario sin permisos solo ve los destinos universales', async () => {
    const destinos = await destinosDisponibles(usuario())
    const claves = destinos.map((d) => d.clave)

    expect(claves).toContain('dashboard')
    expect(claves).toContain('requerimientos_mios')
    // Lo importante del test: lo que NO puede ver.
    expect(claves).not.toContain('usuarios')
    expect(claves).not.toContain('roles')
    expect(claves).not.toContain('auditoria')
    expect(claves).not.toContain('requerimientos_financiero')
  })

  it('el permiso concreto habilita su destino y ningún otro', async () => {
    const destinos = await destinosDisponibles(usuario({ permisos: ['usuarios:gestionar'] }))
    const claves = destinos.map((d) => d.clave)

    expect(claves).toContain('usuarios')
    expect(claves).not.toContain('roles')
  })

  it('un array de permisos significa "cualquiera de estos", no "todos"', async () => {
    // El calendario de ausencias exige ['ausencias:aprobar','ausencias:ver_todas'].
    const destinos = await destinosDisponibles(usuario({ permisos: ['ausencias:ver_todas'] }))
    expect(destinos.map((d) => d.clave)).toContain('ausencias_calendario')
  })

  it('el Super Admin ve todo lo que no dependa de un módulo apagado', async () => {
    const destinos = await destinosDisponibles(usuario({ esSuperAdmin: true }))
    expect(destinos).toHaveLength(CATALOGO_DESTINOS.length)
  })

  it('respeta el esquema legado de módulos (mantenimiento)', async () => {
    const sinModulo = await destinosDisponibles(usuario())
    expect(sinModulo.map((d) => d.clave)).not.toContain('mantenimiento_equipos')

    const conModulo = await destinosDisponibles(usuario({ modulos: ['mantenimiento'] }))
    expect(conModulo.map((d) => d.clave)).toContain('mantenimiento_equipos')
  })
})

describe('filtrado por módulo desactivado', () => {
  it('un módulo apagado esconde sus destinos aunque haya permiso', async () => {
    moduloActivo.mockImplementation(async (m) => m !== 'requerimientos')

    const destinos = await destinosDisponibles(usuario({ esSuperAdmin: true }))
    const claves = destinos.map((d) => d.clave)

    expect(claves).not.toContain('requerimientos_mios')
    expect(claves).not.toContain('requerimientos_financiero')
    // El resto sigue disponible: el apagado es por módulo, no global.
    expect(claves).toContain('dashboard')
  })

  it('consulta cada módulo una sola vez, no una por destino', async () => {
    // Sin agrupar serían ~25 consultas a la configuración para armar una lista
    // de 25 entradas. Es una comprobación de eficiencia con efecto real.
    await destinosDisponibles(usuario({ esSuperAdmin: true }))
    const consultados = moduloActivo.mock.calls.map((c) => c[0])
    expect(new Set(consultados).size).toBe(consultados.length)
  })
})

describe('resolverDestino', () => {
  it('devuelve la ruta cuando el usuario puede abrirla', async () => {
    const r = await resolverDestino('dashboard', usuario())
    expect(r).toMatchObject({ ruta: '/dashboard', clave: 'dashboard' })
    expect(r.error).toBeUndefined()
  })

  it('NO devuelve ruta cuando falta el permiso, aunque el destino exista', async () => {
    const r = await resolverDestino('roles', usuario())
    expect(r.ruta).toBeUndefined()
    expect(r.error).toMatch(/permiso/i)
  })

  it('distingue "no existe" de "no puedes"', async () => {
    // No es cosmético: si a un usuario de Bodega se le dice que /roles "no
    // existe", concluye que el módulo no está hecho.
    const inexistente = await resolverDestino('modulo_inventado', usuario())
    expect(inexistente.error).toMatch(/no existe/i)

    const sinPermiso = await resolverDestino('auditoria', usuario())
    expect(sinPermiso.error).toMatch(/permiso/i)
  })

  it('rechaza una clave vacía', async () => {
    expect((await resolverDestino('', usuario())).error).toBeTruthy()
    expect((await resolverDestino(null, usuario())).error).toBeTruthy()
  })

  it('no acepta una ruta cruda en vez de una clave', async () => {
    // El modelo no puede navegar a una URL arbitraria: solo existen claves del
    // catálogo, y '/usuarios' no es ninguna.
    const r = await resolverDestino('/usuarios', usuario({ esSuperAdmin: true }))
    expect(r.ruta).toBeUndefined()
    expect(r.error).toBeTruthy()
  })
})

describe('integridad del catálogo', () => {
  it('no hay claves ni rutas duplicadas', () => {
    const claves = CATALOGO_DESTINOS.map((d) => d.clave)
    const rutas = CATALOGO_DESTINOS.map((d) => d.ruta)
    expect(new Set(claves).size).toBe(claves.length)
    expect(new Set(rutas).size).toBe(rutas.length)
  })

  it('toda ruta es absoluta y todo destino tiene título y alias', () => {
    for (const d of CATALOGO_DESTINOS) {
      expect(d.ruta.startsWith('/')).toBe(true)
      expect(d.titulo).toBeTruthy()
      expect(Array.isArray(d.alias) && d.alias.length > 0).toBe(true)
    }
  })
})
