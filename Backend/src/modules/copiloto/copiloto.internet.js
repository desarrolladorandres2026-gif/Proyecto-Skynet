// Las dos únicas herramientas del copiloto que salen a internet (ver
// copiloto.herramientas.js). Ambas son APIs públicas gratuitas, sin API key:
// Wikipedia (REST oficial) y Open-Meteo (clima + geocodificación, sin key).
// Se descartó Google Search (ya no es gratis para el modelo que usamos — cobra
// por búsqueda) y el scraping de DuckDuckGo (nos bloqueó al probarlo, y
// depender de eso en producción es frágil).

const TIMEOUT_MS = 6000

// La política de etiqueta de la API de Wikimedia (Wikipedia) exige un
// User-Agent identificable con datos de contacto; sin él, aplica límites de
// tasa mucho más agresivos y algunas peticiones directamente se rechazan.
// Node no manda ninguno por defecto, así que hay que ponerlo explícito.
const USER_AGENT = 'Skynet-ERP-Copiloto/1.0 (Terminal de Transporte de Neiva; contacto: soporte interno)'

// Un tercero caído o lento no debe colgar la respuesta del copiloto: si no
// contesta a tiempo, se le dice al modelo que la herramienta falló y este
// sigue con lo que sepa, en vez de dejar al usuario esperando indefinidamente.
async function fetchConTimeout(url, opciones = {}) {
  const controlador = new AbortController()
  const timeout = setTimeout(() => controlador.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      ...opciones,
      signal: controlador.signal,
      headers: { 'User-Agent': USER_AGENT, ...opciones.headers },
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function buscarWikipedia(consulta) {
  const termino = consulta?.trim()
  if (!termino) return { error: 'Falta indicar qué buscar' }

  try {
    // El resumen (REST summary) exige el título EXACTO del artículo; casi
    // ninguna pregunta real lo trae tal cual ("río magdalena" vs "Río
    // Magdalena"), así que primero se busca el título más parecido con la API
    // de búsqueda clásica y LUEGO se pide su resumen.
    const resBusqueda = await fetchConTimeout(
      `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(termino)}&format=json&srlimit=1`
    )
    if (!resBusqueda.ok) return { error: 'Wikipedia no respondió' }
    const datosBusqueda = await resBusqueda.json()
    const titulo = datosBusqueda?.query?.search?.[0]?.title
    if (!titulo) return { encontrado: false, mensaje: `No se encontró nada en Wikipedia sobre "${termino}"` }

    const resResumen = await fetchConTimeout(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titulo)}`)
    if (!resResumen.ok) return { error: 'Wikipedia no respondió' }
    const resumen = await resResumen.json()
    // type:'disambiguation' es una página de desambiguación ("Neiva puede
    // referirse a..."), no un artículo con contenido real — decirlo explícito
    // para que el modelo no cite un extracto vacío o inservible.
    if (resumen.type === 'disambiguation') {
      return { encontrado: false, mensaje: `"${titulo}" tiene varios significados en Wikipedia; sé más específico.` }
    }
    return {
      encontrado: true,
      titulo: resumen.title,
      extracto: resumen.extract,
      url: resumen.content_urls?.desktop?.page,
    }
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'Wikipedia tardó demasiado en responder' : 'No se pudo consultar Wikipedia' }
  }
}

// Códigos WMO (estándar meteorológico mundial) que devuelve Open-Meteo — se
// traducen a texto porque no hay garantía de que el modelo interprete bien un
// código numérico crudo, y esto es más barato/confiable que preguntárselo.
const DESCRIPCION_CLIMA = {
  0: 'despejado', 1: 'mayormente despejado', 2: 'parcialmente nublado', 3: 'nublado',
  45: 'neblina', 48: 'neblina con escarcha',
  51: 'llovizna ligera', 53: 'llovizna moderada', 55: 'llovizna intensa',
  61: 'lluvia ligera', 63: 'lluvia moderada', 65: 'lluvia intensa',
  71: 'nieve ligera', 73: 'nieve moderada', 75: 'nieve intensa',
  80: 'chubascos ligeros', 81: 'chubascos moderados', 82: 'chubascos violentos',
  95: 'tormenta eléctrica', 96: 'tormenta con granizo ligero', 99: 'tormenta con granizo intenso',
}

export async function consultarClima(ciudad) {
  const nombre = ciudad?.trim()
  if (!nombre) return { error: 'Falta indicar la ciudad' }

  try {
    // Open-Meteo pide latitud/longitud, no nombre de ciudad: primero se
    // geocodifica con su propio servicio (gratis, sin key, mismo proveedor).
    const resGeo = await fetchConTimeout(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(nombre)}&count=1&language=es`
    )
    if (!resGeo.ok) return { error: 'El servicio de clima no respondió' }
    const geo = await resGeo.json()
    const lugar = geo?.results?.[0]
    if (!lugar) return { encontrado: false, mensaje: `No se encontró la ciudad "${nombre}"` }

    const resClima = await fetchConTimeout(
      `https://api.open-meteo.com/v1/forecast?latitude=${lugar.latitude}&longitude=${lugar.longitude}` +
        `&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`
    )
    if (!resClima.ok) return { error: 'El servicio de clima no respondió' }
    const clima = await resClima.json()
    const actual = clima?.current
    if (!actual) return { error: 'El servicio de clima no devolvió datos' }

    return {
      encontrado: true,
      ciudad: lugar.name,
      pais: lugar.country,
      temperaturaC: actual.temperature_2m,
      humedadPorcentaje: actual.relative_humidity_2m,
      condicion: DESCRIPCION_CLIMA[actual.weather_code] || 'sin datos de condición',
    }
  } catch (err) {
    return { error: err.name === 'AbortError' ? 'El servicio de clima tardó demasiado' : 'No se pudo consultar el clima' }
  }
}
