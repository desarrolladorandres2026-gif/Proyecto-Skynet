import { ausencias as ausenciasApi } from '../../api/ausencias.js'

// Enlace al soporte médico (PDF o foto). Mismo criterio que la bandeja de
// vacaciones: archivo propio del servidor, o la URL histórica de Cloudinary.
export function urlSoporteDe(ausencia) {
  const s = ausencia?.soporte
  if (!s) return null
  if (s.archivo) return ausenciasApi.urlSoporte(ausencia._id, s.archivo)
  if (s.url?.startsWith('http') || s.url?.startsWith('/')) return s.url
  return null
}

export function nombreSolicitante(a) {
  return a.solicitante?.nombre || a.solicitante?.nombre_usuario || '—'
}
