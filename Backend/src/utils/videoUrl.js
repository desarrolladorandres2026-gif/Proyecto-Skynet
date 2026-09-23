import { ErrorValidacion } from './errores.js'

// Clasifica la URL que registra un administrador para un video informativo y
// extrae lo mínimo necesario para reproducirlo dentro de Skynet SIN confiar en
// que el cliente construya bien un <iframe>: el servidor decide el proveedor y
// el identificador, y el frontend solo arma la URL de incrustación a partir de
// datos ya validados (ver videos.service.js#aVideoPublico).
//
// Proveedores:
//  - youtube / vimeo : se incrustan en un iframe (ID validado con regex estricta).
//  - archivo         : enlace directo a un .mp4/.webm/... — se reproduce en <video>.
//  - externo         : cualquier otra URL https; no se puede incrustar, se abre
//                      en una pestaña nueva.
//
// Solo se aceptan URLs https: descarta de entrada `javascript:`, `data:`,
// `http:` (contenido mixto bloqueado por el navegador) y URLs con credenciales.

const LONGITUD_MAXIMA_URL = 2048
const RE_ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/
const RE_ID_VIMEO = /^\d{6,12}$/
const RE_HASH_VIMEO = /^[A-Za-z0-9]{6,32}$/
const RE_EXTENSION_VIDEO = /\.(mp4|webm|ogv|ogg|mov|m4v)$/i

const HOSTS_YOUTUBE = new Set(['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'])
const HOSTS_VIMEO = new Set(['vimeo.com', 'player.vimeo.com'])

function idYoutube(url, host) {
  let candidato = null
  if (host === 'youtu.be') {
    candidato = url.pathname.split('/')[1]
  } else if (HOSTS_YOUTUBE.has(host)) {
    const [, primero, segundo] = url.pathname.split('/')
    if (primero === 'watch') candidato = url.searchParams.get('v')
    else if (['embed', 'shorts', 'live', 'v'].includes(primero)) candidato = segundo
  }
  return candidato && RE_ID_YOUTUBE.test(candidato) ? candidato : null
}

function datosVimeo(url, host) {
  if (!HOSTS_VIMEO.has(host)) return null
  const segmentos = url.pathname.split('/').filter(Boolean)
  // vimeo.com/123456789 | vimeo.com/123456789/abcdef1234 (no listado) |
  // player.vimeo.com/video/123456789?h=abcdef1234
  const indiceId = host === 'player.vimeo.com' ? 1 : 0
  const id = segmentos[indiceId]
  if (!id || !RE_ID_VIMEO.test(id)) return null
  const hash = segmentos[indiceId + 1] || url.searchParams.get('h') || ''
  return { videoId: id, videoHash: RE_HASH_VIMEO.test(hash) ? hash : '' }
}

/**
 * @param {unknown} entrada URL escrita por el administrador
 * @returns {{ url: string, proveedor: 'youtube'|'vimeo'|'archivo'|'externo', videoId: string, videoHash: string }}
 * @throws {ErrorValidacion} si no es una URL https utilizable
 */
export function analizarUrlVideo(entrada) {
  if (typeof entrada !== 'string' || !entrada.trim()) {
    throw new ErrorValidacion('La URL del video es obligatoria')
  }
  const texto = entrada.trim()
  if (texto.length > LONGITUD_MAXIMA_URL) {
    throw new ErrorValidacion(`La URL del video no puede superar ${LONGITUD_MAXIMA_URL} caracteres`)
  }

  let url
  try {
    url = new URL(texto)
  } catch {
    throw new ErrorValidacion('La URL del video no es válida')
  }
  if (url.protocol !== 'https:') {
    throw new ErrorValidacion('La URL del video debe comenzar con https://')
  }
  if (url.username || url.password) {
    throw new ErrorValidacion('La URL del video no puede incluir credenciales')
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '')

  const youtube = idYoutube(url, host)
  if (youtube) return { url: texto, proveedor: 'youtube', videoId: youtube, videoHash: '' }

  const vimeo = datosVimeo(url, host)
  if (vimeo) return { url: texto, proveedor: 'vimeo', ...vimeo }

  // Un host de YouTube/Vimeo sin ID reconocible es casi seguro un enlace mal
  // copiado (p. ej. la portada del canal): se rechaza en vez de guardarlo como
  // "externo" y descubrir después que no reproduce.
  if (HOSTS_YOUTUBE.has(host) || host === 'youtu.be' || HOSTS_VIMEO.has(host)) {
    throw new ErrorValidacion('No se reconoce el enlace del video de YouTube/Vimeo. Copia la dirección de un video concreto')
  }

  if (RE_EXTENSION_VIDEO.test(url.pathname)) {
    return { url: texto, proveedor: 'archivo', videoId: '', videoHash: '' }
  }
  return { url: texto, proveedor: 'externo', videoId: '', videoHash: '' }
}
