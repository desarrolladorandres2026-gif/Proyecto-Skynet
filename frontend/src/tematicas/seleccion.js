// Lógica pura (sin React) para decidir qué temática está activa.

// ¿Está `fecha` dentro de la temporada de la temática? La temporada es
// { desde: [mes, día], hasta: [mes, día] } y puede cruzar el fin de año
// (p. ej. 15 nov → 6 ene).
export function enTemporada(def, fecha = new Date()) {
  if (!def?.temporada) return false
  const { desde, hasta } = def.temporada
  const hoy = (fecha.getMonth() + 1) * 100 + fecha.getDate()
  const ini = desde[0] * 100 + desde[1]
  const fin = hasta[0] * 100 + hasta[1]
  return ini <= fin ? hoy >= ini && hoy <= fin : hoy >= ini || hoy <= fin
}

// preferencia: 'auto' | 'ninguna' | id de temática.
// Un id elegido a mano se respeta aunque no sea su temporada (para poder
// probar Halloween en julio). Un id desconocido (temática retirada) cae a 'auto'.
export function resolverTematica(preferencia, registro, fecha = new Date()) {
  if (preferencia === 'ninguna') return null
  if (preferencia && preferencia !== 'auto') {
    const elegida = registro.find((t) => t.id === preferencia)
    if (elegida) return elegida
  }
  return registro.find((t) => enTemporada(t, fecha)) ?? null
}
