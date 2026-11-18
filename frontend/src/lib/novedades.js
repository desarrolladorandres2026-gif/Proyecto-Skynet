// Lógica pura de los puntos de "novedad" del menú (sin React, para poder
// probarla aislada). Un item de modulosRegistry.js se marca como nuevo con
// `nuevoHasta: 'AAAA-MM-DD'`: mientras esa fecha no pase, el item muestra un
// punto hasta que el usuario lo visita. La fecha límite evita que un usuario
// que entra meses después vea puntos en funciones que ya no son novedad.

const PREFIJO_STORAGE = 'skynet-novedades-vistas-'

// Fecha LOCAL en AAAA-MM-DD. No usar toISOString(): devuelve UTC y en Colombia
// (UTC-5) adelantaría el día a partir de las 7 pm.
export function hoyISO(fecha = new Date()) {
  const dos = (n) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`
}

// ¿Este item sigue dentro de su ventana de novedad? (comparación de strings
// ISO: el orden lexicográfico coincide con el cronológico).
export function esNovedadVigente(item, hoy = hoyISO()) {
  return Boolean(item?.nuevoHasta) && hoy <= item.nuevoHasta
}

// Misma regla de coincidencia que el sidebar: `end` exige ruta exacta; si no,
// vale la ruta del item y cualquier subruta (/sitio-web/radicados/123).
export function rutaCoincide(pathname, item) {
  if (item.end) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

export function leerVistas(idUsuario) {
  if (idUsuario == null) return new Set()
  try {
    const crudo = localStorage.getItem(PREFIJO_STORAGE + idUsuario)
    const lista = crudo ? JSON.parse(crudo) : []
    return new Set(Array.isArray(lista) ? lista : [])
  } catch {
    // Storage bloqueado o JSON corrupto: se trata como "no ha visto nada".
    return new Set()
  }
}

export function guardarVistas(idUsuario, vistas) {
  if (idUsuario == null) return
  try {
    localStorage.setItem(PREFIJO_STORAGE + idUsuario, JSON.stringify([...vistas]))
  } catch {
    // Sin storage el punto reaparece en la próxima carga: molesto, no grave.
  }
}
