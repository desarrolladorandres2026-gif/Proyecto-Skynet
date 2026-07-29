const UNIDADES = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }

// Convierte cadenas tipo "8h", "15m", "30s" (el mismo formato que acepta
// jsonwebtoken en expiresIn) a milisegundos, para usarlas como maxAge de cookie.
export function duracionAMs(valor) {
  if (typeof valor === 'number') return valor
  const match = /^(\d+)\s*([smhd])$/.exec(String(valor).trim())
  if (!match) throw new Error(`Formato de duración inválido: "${valor}"`)
  const [, cantidad, unidad] = match
  return Number(cantidad) * UNIDADES[unidad]
}
