import sanitizeHtml from 'sanitize-html'
import { env } from '../../config/env.js'

// Todo HTML que Skynet manda a WordPress pasa por aquí. El sitio público
// renderiza ese HTML tal cual, así que aceptar HTML libre dejaría a cualquier
// usuario con permiso de edición inyectar scripts en la página institucional.
// La lista es la que el editor de Skynet (TipTap) puede producir; lo demás se
// descarta en silencio.

function hostSitio() {
  try {
    return new URL(env.WP_URL).host
  } catch {
    return ''
  }
}

// Las imágenes solo pueden venir de la biblioteca del propio sitio: una
// imagen en un servidor ajeno se puede cambiar después por otra cosa, y sirve
// de baliza de rastreo para quien la aloja.
// Se aceptan también subdominios (el sitio tiene medios guardados con
// webpage.elterminalneiva.com además de elterminalneiva.com).
function imagenPermitida(src) {
  try {
    const url = new URL(src)
    const base = hostSitio()
    return url.protocol === 'https:' && Boolean(base) && (url.host === base || url.host.endsWith(`.${base}`))
  } catch {
    return false
  }
}

const OPCIONES = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 's', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr'],
  allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt', 'width', 'height'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['https'] },
  transformTags: {
    b: 'strong',
    i: 'em',
    a: (_tag, atributos) => ({
      tagName: 'a',
      attribs: { ...atributos, rel: 'noopener noreferrer', ...(atributos.target ? { target: '_blank' } : {}) },
    }),
  },
  exclusiveFilter: (marco) => marco.tag === 'img' && !imagenPermitida(marco.attribs.src),
}

export function sanitizarHtml(html) {
  return sanitizeHtml(String(html), OPCIONES).trim()
}

// Texto plano -> párrafos escapados (&, < y > escapados; \n\n separa párrafos).
export function textoAParrafos(texto) {
  const escapado = String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escapado
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

// Acepta lo que mande el cliente: HTML del editor enriquecido o texto plano.
export function prepararContenido(valor) {
  const texto = String(valor ?? '')
  return /<[a-z][\s\S]*>/i.test(texto) ? sanitizarHtml(texto) : textoAParrafos(texto)
}
