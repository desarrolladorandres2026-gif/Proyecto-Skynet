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

// ── Por qué el BASE dejó de decir "responde SOLO con tus herramientas" ──────
// Esa regla era correcta cuando el copiloto solo consultaba datos del ERP.
// Con el motor de herramientas actual dejó de serlo: prohibía justamente lo
// que un asistente debe hacer bien —explicar un concepto, traducir, resumir—
// y empujaba al modelo a contestar "eso no lo cubren mis herramientas" a
// preguntas que sabe responder perfectamente.
//
// La regla correcta no es sobre la FUENTE sino sobre el DOMINIO: los datos del
// Terminal (cifras, estados, fechas, quién tiene qué) solo pueden salir de una
// herramienta, porque inventarlos es indistinguible de acertarlos y sale con
// la voz de la institución. El conocimiento general se responde directamente:
// pasarlo por una herramienta sería lento y peor.
const BASE = `Eres Skynet, el asistente del Terminal de Transporte de Neiva.

Cómo hablas:
- Español, directo y breve: dos o tres frases salvo que pidan detalle.
- Como un compañero competente, no como un manual. El dato importante primero.
- Te leen en voz alta: sin Markdown, tablas ni listas largas salvo que las pidan.
- No narres tu mecánica ("consulté X"): di el resultado.

Qué respondes tú y qué exige herramienta:
- Conocimiento general (definir, explicar, traducir, resumir, redactar):
  responde directo, sin herramientas.
- Datos del Terminal (cifras, estados, fechas, pendientes): SOLO desde una
  herramienta. Nunca los inventes ni los estimes.
- Lo que dependa de HOY (hora, fecha, clima, tasas, noticias, precios): usa la
  herramienta aunque creas saberlo. Tu memoria tiene fecha de corte.
- Números que operar: usa calcular, no aritmética mental.
- Si una herramienta falla o no encuentra nada, dilo; no lo tapes respondiendo
  de memoria como si la hubieras consultado.
- Si no lo sabes y nada lo cubre, dilo en una frase y sugiere a qué área acudir.
- Si te falta un dato, pregunta UNA cosa concreta en vez de responder a medias.

Herramientas y acciones:
- Lo que devuelven ya viene filtrado por los permisos de quien pregunta: úsalo
  tal cual, no lo recortes ni lo cuestiones.
- abrir_seccion solo acepta las secciones que te aparecen listadas. Si piden
  otra, di que no tiene acceso; no inventes claves.
- Ninguna herramienta tuya aprueba, rechaza ni elimina nada. Si te lo piden,
  explica desde qué módulo se hace.
- Si una acción queda pendiente de confirmación, di qué pasará al confirmar y
  NUNCA la des por hecha.`

/**
 * Arma la instrucción de sistema completa para este usuario.
 *
 * @param {object} usuario  El de req.usuario.
 * @param {Array<{clave:string, valor:string}>} hechos  Memoria larga.
 * @param {string[]} temas  Temas ya tratados en esta conversación.
 * @param {object|null} estado  Estado conversacional (ver copiloto.estados.js).
 */
export function instruccionSistema(usuario, hechos = [], temas = [], estado = null) {
  const capas = [BASE, perfil(usuario)]

  if (hechos.length) capas.push(memoria(hechos))
  // Los temas son memoria CORTA barata: le dan continuidad al hilo sin
  // reenviar los turnos viejos que ya se recortaron. Cuestan una línea.
  if (temas.length) capas.push(`En esta conversación ya hablaron de: ${temas.join(', ')}.`)
  const capaEstado = estadoConversacion(estado)
  if (capaEstado) capas.push(capaEstado)

  return capas.join('\n\n')
}

/**
 * Resume el estado conversacional en una capa de prompt.
 *
 * Existe para que un "sí", "urgente" o "también agrega instalación" no
 * dependa de que el modelo relea 8 turnos de prosa para entender a qué se
 * refiere: el servidor ya sabe si hay una pregunta pendiente o un borrador en
 * curso, y se lo dice en una línea. El modelo sigue siendo quien decide qué
 * hacer con eso — esto es contexto, no una orden.
 */
function estadoConversacion(estado) {
  if (!estado || estado.flujo === 'IDLE') return null

  const partes = [`Flujo activo de esta conversación: ${estado.flujo}.`]

  if (estado.ultimaPregunta) {
    partes.push(
      `Tu última pregunta al usuario fue: "${estado.ultimaPregunta}". Si el mensaje que sigue es corto o ambiguo ("sí", "también", "urgente", "mañana", "ese"), interprétalo primero como respuesta a ESA pregunta antes que como un mensaje nuevo sin contexto.`
    )
  }

  if (estado.entidadActiva) {
    partes.push(`Entidad activa: ${estado.entidadActiva.tipo}${estado.entidadActiva.id ? ` (id ${estado.entidadActiva.id})` : ''}.`)
  }

  if (estado.borrador) {
    partes.push(
      `Ya existe un borrador en curso, armado con la herramienta de preparación correspondiente:\n${JSON.stringify(estado.borrador)}\nSi el usuario pide agregar, quitar o cambiar algo de esto, vuelve a llamar esa misma herramienta con la lista COMPLETA ya actualizada (lo que ya había más el cambio) — no le pidas que repita lo que ya dijo antes.`
    )
  }

  return partes.join('\n')
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
