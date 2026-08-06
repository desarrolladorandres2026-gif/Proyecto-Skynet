// Construcción del prompt por capas. Antes era un único texto de ~450 tokens
// que se rearmaba y reenviaba idéntico en cada mensaje; ahora se separa en
// tres piezas con vidas distintas:
//
//   BASE     — invariante. Idéntico para todos los usuarios y todos los
//              mensajes. Es el candidato natural a caché de prompt del
//              proveedor el día que se active (ver §escalado del plan).
//   PERFIL   — quién pregunta. Cambia por usuario, no por mensaje.
//   MEMORIA  — hechos que la persona pidió recordar. Cambia rara vez.
//
// ── Por qué el BASE encogió tanto ───────────────────────────────────────────
// El prompt anterior dedicaba tres párrafos a explicarle al modelo que los
// datos ya venían filtrados por permisos y que no los recortara otra vez. Eso
// era necesario cuando el texto TAMBIÉN intentaba imponer el alcance; pero el
// alcance real nunca lo puso el prompt, lo ponen las dos capas de
// copiloto.herramientas.js (qué se declara y qué filtra cada herramienta al
// ejecutarse). Explicarle al modelo un mecanismo que él no controla es prompt
// que se paga en cada mensaje sin cambiar el resultado.
//
// Lo que sí queda es lo único que el prompt puede lograr y ninguna otra capa
// cubre: que RECHACE con un mensaje útil en vez de inventar, y el tono.

const BASE = `Eres Skynet, el asistente del Terminal de Transporte de Neiva.

Cómo hablas:
- Español, directo y breve. Dos o tres frases salvo que pidan detalle.
- Como un compañero de trabajo competente, no como un manual. Nada de
  "he procedido a consultar" ni de repetir la pregunta antes de responder.
- El dato importante va primero, el contexto después.
- Te leen en voz alta: evita listas largas, tablas y Markdown salvo que te
  pidan un listado explícito.

Reglas:
- Responde SOLO con lo que devuelvan tus herramientas. Nunca inventes cifras,
  estados ni fechas, y no completes con suposiciones lo que falte.
- Lo que te devuelve una herramienta ya viene filtrado por los permisos reales
  de quien pregunta. Úsalo tal cual: no lo recortes ni lo cuestiones.
- Si algo no lo cubre ninguna de tus herramientas, dilo en una frase y sugiere
  a qué área acudir. No lo deduzcas ni lo estimes.
- Ninguna herramienta aprueba, rechaza ni modifica nada. Si te lo piden,
  explica desde qué módulo se hace.
- Si te falta un dato para responder bien, pregunta UNA cosa concreta en vez de
  responder a medias.`

/**
 * Arma la instrucción de sistema completa para este usuario.
 *
 * @param {object} usuario  El de req.usuario.
 * @param {Array<{clave:string, valor:string}>} hechos  Memoria larga.
 * @param {string[]} temas  Temas ya tratados en esta conversación.
 */
export function instruccionSistema(usuario, hechos = [], temas = []) {
  const capas = [BASE, perfil(usuario)]

  if (hechos.length) capas.push(memoria(hechos))
  // Los temas son memoria CORTA barata: le dan continuidad al hilo sin
  // reenviar los turnos viejos que ya se recortaron. Cuestan una línea.
  if (temas.length) capas.push(`En esta conversación ya hablaron de: ${temas.join(', ')}.`)

  return capas.join('\n\n')
}

function perfil(usuario) {
  const nombre = usuario?.nombre_usuario || 'un usuario'
  const rol = usuario?.rol?.nombre || 'sin rol asignado'
  // La fecha es indispensable y antes no estaba: sin ella el modelo no puede
  // resolver "esta semana", "ayer" ni "para mañana", y o inventaba una fecha o
  // preguntaba algo que el servidor ya sabe. Va en formato largo en español
  // porque es lo que va a repetir al hablar.
  const hoy = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Bogota',
  })
  return `Atiendes a ${nombre}, rol "${rol}". Hoy es ${hoy}.`
}

function memoria(hechos) {
  const lineas = hechos.map((h) => `- ${h.clave}: ${h.valor}`).join('\n')
  return `Cosas que esta persona te pidió recordar:\n${lineas}`
}

// Exportado solo para las pruebas: permite verificar que el texto invariante
// no crezca sin que nadie se dé cuenta (ver copiloto.prompt.test.js).
export const PROMPT_BASE = BASE
