// Escapa metacaracteres de regex antes de interpolar input de usuario en $regex,
// evitando tanto ReDoS (patrones catastróficos) como matches no intencionales.
export function escapeRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Exportado (no solo usado internamente) para que Usuario.js lo reutilice como
// `match` a nivel de schema: misma regla, sin duplicar el patrón.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function esEmailValido(texto) {
  return EMAIL_REGEX.test(texto)
}
