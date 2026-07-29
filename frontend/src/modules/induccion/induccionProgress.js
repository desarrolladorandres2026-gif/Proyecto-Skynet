// Progreso de la inducción persistido en localStorage, namespaced por
// usuario (a diferencia del induccion/*.html original, que usaba una sola
// clave global y por lo tanto mezclaba el avance de cualquier persona que
// usara el mismo navegador/equipo).

const PREFIJO = 'skynet_induccion'

function clave(usuarioId, sufijo) {
  return `${PREFIJO}_${usuarioId || 'anon'}_${sufijo}`
}

function leerJSON(key, porDefecto) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : porDefecto
  } catch {
    return porDefecto
  }
}

export function getCompletados(usuarioId) {
  return leerJSON(clave(usuarioId, 'completados'), [])
}

export function marcarCompletado(usuarioId, moduloId) {
  const completados = getCompletados(usuarioId)
  if (!completados.includes(moduloId)) {
    completados.push(moduloId)
    localStorage.setItem(clave(usuarioId, 'completados'), JSON.stringify(completados))
  }
}

export function getPuntaje(usuarioId, moduloId) {
  return localStorage.getItem(clave(usuarioId, `puntaje_${moduloId}`))
}

export function setPuntaje(usuarioId, moduloId, correctas, total) {
  localStorage.setItem(clave(usuarioId, `puntaje_${moduloId}`), `${correctas}/${total}`)
}

export function reiniciarProgreso(usuarioId, totalModulos) {
  localStorage.removeItem(clave(usuarioId, 'completados'))
  for (let i = 1; i <= totalModulos; i++) {
    localStorage.removeItem(clave(usuarioId, `puntaje_${i}`))
  }
}
