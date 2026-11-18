// Detección de spam en los formularios públicos del sitio (sobre todo el de
// contacto). Es una heurística sobre el resumen del radicado (solicitante,
// correo, asunto), pensada para MARCAR y no avisar, nunca para borrar: un falso
// positivo solo cuesta una etiqueta de más, no un ciudadano sin respuesta.

// Dominios de remitentes de spam ya vistos. Se amplía a medida que aparezcan.
const DOMINIOS_SPAM = new Set(['jmailservice.com'])

const norm = (t) => String(t ?? '').trim().toLowerCase()

export function motivosDeSpam({ solicitante, correo, asunto } = {}) {
  const motivos = []
  // Plantillas de envío masivo con la variable sin reemplazar: "Hi %domain% team".
  if (/%\w+%/.test(String(asunto ?? ''))) motivos.push('plantilla_sin_reemplazar')
  // Un "nombre" que es solo un número (p. ej. 8054002077).
  if (/^\d{6,}$/.test(norm(solicitante).replace(/[\s.-]/g, ''))) motivos.push('nombre_numerico')
  const dominio = norm(correo).split('@')[1]
  if (dominio && DOMINIOS_SPAM.has(dominio)) motivos.push('dominio_conocido')
  return motivos
}

export const esSpamProbable = (resumen) => motivosDeSpam(resumen).length > 0
