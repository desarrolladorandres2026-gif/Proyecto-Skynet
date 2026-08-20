// Hora, fecha y zonas horarias.
//
// ── Por qué esto vive en el SERVIDOR y no en el navegador ───────────────────
// La tentación es resolverlo en el frontend: el reloj del cliente ya está ahí
// y no cuesta una petición. Pero el reloj del cliente es un dato del cliente,
// y hay dos formas concretas de que mienta:
//  - El equipo tiene la hora o la zona mal configuradas (pasa constantemente
//    en máquinas de escritorio compartidas).
//  - El usuario la cambia a propósito. Como la hora que responda el copiloto
//    sale con la voz de la institución, y en un ERP se usa para fechar cosas
//    ("radícalo hoy"), no puede depender de lo que diga el equipo de quien
//    pregunta.
// El servidor es la única fuente que el Terminal controla.
//
// No hace falta librería de zonas horarias: `Intl.DateTimeFormat` con
// `timeZone` usa la base de datos IANA que ya trae Node, y se mantiene sola
// con las actualizaciones del runtime. Una dependencia como moment-timezone
// agregaría ~180 KB y su propia copia de la base, que hay que ir actualizando.

// Colombia. Se usa cuando nadie indica otra: es donde está el Terminal, así
// que "¿qué hora es?" sin más siempre significa esto.
const ZONA_POR_DEFECTO = 'America/Bogota'

// Ciudades y países que la gente nombra en voz alta, mapeados a su zona IANA.
// Es una lista corta a propósito: cubre lo que de verdad se pregunta en este
// contexto (Colombia, los países con familiares o proveedores, las bolsas).
// Lo que no esté aquí se intenta igual como zona IANA literal antes de fallar,
// así que el modelo puede pasar "Europe/Lisbon" y funciona sin tocar la lista.
const ZONAS_CONOCIDAS = {
  colombia: 'America/Bogota',
  bogota: 'America/Bogota',
  neiva: 'America/Bogota',
  medellin: 'America/Bogota',
  cali: 'America/Bogota',
  barranquilla: 'America/Bogota',
  cartagena: 'America/Bogota',
  bucaramanga: 'America/Bogota',
  'nueva york': 'America/New_York',
  'new york': 'America/New_York',
  miami: 'America/New_York',
  washington: 'America/New_York',
  'los angeles': 'America/Los_Angeles',
  california: 'America/Los_Angeles',
  chicago: 'America/Chicago',
  mexico: 'America/Mexico_City',
  'ciudad de mexico': 'America/Mexico_City',
  lima: 'America/Lima',
  peru: 'America/Lima',
  quito: 'America/Guayaquil',
  ecuador: 'America/Guayaquil',
  caracas: 'America/Caracas',
  venezuela: 'America/Caracas',
  panama: 'America/Panama',
  'santiago de chile': 'America/Santiago',
  chile: 'America/Santiago',
  'buenos aires': 'America/Argentina/Buenos_Aires',
  argentina: 'America/Argentina/Buenos_Aires',
  'sao paulo': 'America/Sao_Paulo',
  brasil: 'America/Sao_Paulo',
  madrid: 'Europe/Madrid',
  espana: 'Europe/Madrid',
  barcelona: 'Europe/Madrid',
  londres: 'Europe/London',
  paris: 'Europe/Paris',
  roma: 'Europe/Rome',
  berlin: 'Europe/Berlin',
  tokio: 'Asia/Tokyo',
  japon: 'Asia/Tokyo',
  pekin: 'Asia/Shanghai',
  china: 'Asia/Shanghai',
  dubai: 'Asia/Dubai',
  sidney: 'Australia/Sydney',
  australia: 'Australia/Sydney',
}

const DIACRITICOS = new RegExp('[\\u0300-\\u036f]', 'g')

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .trim()
}

/**
 * Traduce lo que dijo el usuario a una zona IANA válida.
 *
 * Devuelve `null` en vez de caer a la zona por defecto cuando no reconoce el
 * lugar: responder la hora de Bogotá a quien preguntó por Tokio es peor que
 * decir que no se sabe, porque el usuario no tiene forma de notar el error.
 */
export function resolverZona(lugar) {
  if (!lugar) return ZONA_POR_DEFECTO

  const clave = normalizar(lugar)
  if (ZONAS_CONOCIDAS[clave]) return ZONAS_CONOCIDAS[clave]

  // Zona IANA literal ("America/Bogota"): se valida preguntándole a Intl en
  // vez de con una regex. Es la única comprobación que no se desactualiza
  // cuando cambian las zonas del mundo (y cambian: Chile, México y Egipto
  // movieron las suyas en la última década).
  try {
    new Intl.DateTimeFormat('es-CO', { timeZone: lugar }).format(new Date())
    return lugar
  } catch {
    return null
  }
}

function partesEn(fecha, zona) {
  const fmt = new Intl.DateTimeFormat('es-CO', {
    timeZone: zona,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
  // formatToParts en vez de format(): permite componer las frases sin tener
  // que parsear de vuelta la cadena que acaba de generar el formateador.
  const partes = Object.fromEntries(fmt.formatToParts(fecha).map((p) => [p.type, p.value]))
  return partes
}

// Desfase respecto a UTC en la zona pedida, en horas. Se calcula comparando el
// mismo instante formateado en las dos zonas porque JS no expone el offset de
// una zona arbitraria directamente — y hacerlo así respeta el horario de
// verano automáticamente (media hora en India, 45 minutos en Nepal incluidos).
function desfaseUTC(fecha, zona) {
  const enZona = new Date(fecha.toLocaleString('en-US', { timeZone: zona }))
  const enUTC = new Date(fecha.toLocaleString('en-US', { timeZone: 'UTC' }))
  const horas = (enZona - enUTC) / 3600000
  const signo = horas >= 0 ? '+' : '-'
  const abs = Math.abs(horas)
  const h = Math.floor(abs)
  const m = Math.round((abs - h) * 60)
  return `UTC${signo}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`
}

/**
 * Hora actual. `lugar` es opcional: sin él, la del Terminal.
 */
export function horaActual(lugar) {
  const zona = resolverZona(lugar)
  if (!zona) return { error: `No reconozco la zona horaria de "${lugar}"` }

  const ahora = new Date()
  const p = partesEn(ahora, zona)

  return {
    zona,
    hora: `${p.hour}:${p.minute} ${p.dayPeriod || ''}`.trim(),
    hora24: new Intl.DateTimeFormat('es-CO', { timeZone: zona, hour: '2-digit', minute: '2-digit', hour12: false }).format(ahora),
    fecha: `${p.weekday} ${p.day} de ${p.month} de ${p.year}`,
    desfaseUTC: desfaseUTC(ahora, zona),
    // ISO completo para que el modelo pueda razonar con la fecha si hace falta
    // (restar días, comparar) sin tener que reinterpretar el texto en español.
    iso: ahora.toISOString(),
  }
}

/**
 * Fecha actual, con los datos que hacen falta para resolver "esta semana",
 * "el lunes" o "fin de mes" sin que el modelo tenga que calcularlos.
 */
export function fechaActual(lugar) {
  const zona = resolverZona(lugar)
  if (!zona) return { error: `No reconozco la zona horaria de "${lugar}"` }

  const ahora = new Date()
  const p = partesEn(ahora, zona)

  // 'en-CA' da exactamente YYYY-MM-DD, que es el ISO corto. Es un truco
  // conocido y estable: evita construir la cadena a mano a partir de las
  // partes (donde es fácil equivocarse con el padding y con el mes 0-indexado).
  const isoCorto = new Intl.DateTimeFormat('en-CA', { timeZone: zona }).format(ahora)

  return {
    zona,
    fecha: `${p.weekday} ${p.day} de ${p.month} de ${p.year}`,
    fechaISO: isoCorto,
    diaSemana: p.weekday,
    dia: Number(p.day),
    mes: p.month,
    anio: Number(p.year),
  }
}

export { ZONA_POR_DEFECTO }
