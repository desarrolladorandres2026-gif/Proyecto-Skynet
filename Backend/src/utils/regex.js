// Escapa metacaracteres de regex antes de interpolar input de usuario en $regex,
// evitando tanto ReDoS (patrones catastróficos) como matches no intencionales.
export function escapeRegex(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function esEmailValido(texto) {
  return EMAIL_REGEX.test(texto)
}
