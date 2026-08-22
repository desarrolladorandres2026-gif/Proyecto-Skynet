import EstadoPlataforma from '../../models/EstadoPlataforma.js'
import EventoPlataforma from '../../models/EventoPlataforma.js'

const CLAVE = 'global'

// Devuelve el singleton, creándolo la primera vez. El upsert es atómico: si
// dos procesos arrancan simultáneamente, el índice único de `clave` hace que
// solo uno inserte y el otro lea el existente, en vez de dejar dos documentos
// de estado compitiendo (que es la forma más silenciosa de que "el
// mantenimiento se apagó solo").
export async function obtenerEstado() {
  return EstadoPlataforma.findOneAndUpdate(
    { clave: CLAVE },
    { $setOnInsert: { clave: CLAVE } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
}

// Compare-and-swap: aplica `cambios` SOLO si el documento sigue cumpliendo
// `filtroEsperado`. Devuelve null si otro proceso (u otro tick del worker en
// este mismo proceso) ya movió el estado — el llamador debe tratar ese null
// como "no me toca a mí", nunca como error.
//
// Es el mismo patrón que publicarPendientes() en el módulo SIG, y es lo único
// que garantiza que una transición de mantenimiento (y su notificación
// asociada) ocurra EXACTAMENTE UNA VEZ aunque mañana haya varias instancias
// de Node detrás de nginx.
export async function transicionar(filtroEsperado, cambios) {
  return EstadoPlataforma.findOneAndUpdate(
    { clave: CLAVE, ...filtroEsperado },
    cambios,
    { new: true }
  )
}

export async function registrarEvento(datos) {
  return EventoPlataforma.create(datos)
}

export async function listarEventos({ pagina = 1, porPagina = 20 } = {}) {
  const saltar = (pagina - 1) * porPagina
  const [eventos, total] = await Promise.all([
    EventoPlataforma.find().sort({ creadoEn: -1 }).skip(saltar).limit(porPagina).lean(),
    EventoPlataforma.countDocuments(),
  ])
  return { eventos, total }
}
