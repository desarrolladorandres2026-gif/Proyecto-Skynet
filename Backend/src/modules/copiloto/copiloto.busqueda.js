// Búsqueda web general.
//
// ── Por qué hay TRES proveedores y no uno ──────────────────────────────────
// Esta es la única capacidad del copiloto que no se puede garantizar sin una
// cuenta de un tercero, y fingir lo contrario sería el peor resultado posible:
// un asistente que dice "según la web…" cuando en realidad no buscó nada.
//
// Así que se escalona por calidad, y se declara qué se usó:
//
//   1. TAVILY (TAVILY_API_KEY)  — el mejor para esto. Está construido para
//      LLMs: devuelve el CONTENIDO extraído de cada página, no solo el
//      fragmento del buscador, así que el modelo razona sobre texto real.
//      1.000 búsquedas/mes gratis.
//   2. BRAVE (BRAVE_SEARCH_API_KEY) — índice web propio (no revende Google/
//      Bing), 2.000 búsquedas/mes gratis. Devuelve título + fragmento + URL.
//   3. DuckDuckGo Instant Answer — SIN key, siempre disponible. Es el modo
//      degradado, y hay que ser claro sobre lo que es: NO es un buscador web.
//      Solo devuelve la "respuesta instantánea" de DDG (definiciones, fichas
//      de entidad) y falla en la mayoría de preguntas de actualidad. Existe
//      para que el sistema funcione sin configurar nada, no para sustituir a
//      los otros dos.
//
// Se descartó el scraping de resultados HTML (de DuckDuckGo o de quien sea):
// ya nos bloqueó al probarlo, va contra los términos de uso, y una función
// que depende de que no cambie el HTML ajeno se rompe sin avisar.
//
// Se descartó el `googleSearch` nativo de Gemini: dejó de ser gratuito para el
// modelo que usamos (factura por búsqueda) — ver copiloto.service.js.

import { env } from '../../config/env.js'
import { cacheHerramientas } from './copiloto.cache.js'

// Baja de 8 s a 5 s. Una búsqueda web es UNA petición (no dos encadenadas como
// en copiloto.internet.js), pero después de ella todavía queda una vuelta
// completa al modelo para redactar la respuesta: 8 s aquí eran 9-10 s de espera
// real para el usuario. Medido contra los tres proveedores, una búsqueda que
// funciona responde en menos de 1 s; pasando de 5 s lo que hay es un proveedor
// caído, y para eso el modo degradado es mejor respuesta que seguir esperando.
const TIMEOUT_MS = 5000

// Cuántos resultados se le pasan al modelo. Cinco es el punto donde deja de
// mejorar la respuesta y empieza a costar tokens: con más, el modelo tiende a
// resumir el ruido en vez de responder la pregunta.
const MAX_RESULTADOS = 5

// Los fragmentos vienen con longitudes muy dispares (Tavily puede devolver
// páginas enteras). Sin techo, una sola búsqueda infla el prompt más que toda
// la conversación previa.
const MAX_CARACTERES_FRAGMENTO = 800

// Una búsqueda es cara (red + cuota del proveedor) y la misma pregunta se
// repite mucho dentro de una conversación. 10 minutos es corto para "quién es
// el presidente" y suficiente para no pagar dos veces la misma consulta en el
// mismo hilo. Clave SIN usuario: los resultados de la web son públicos e
// idénticos para todos.
const TTL_BUSQUEDA_MS = 10 * 60 * 1000

const USER_AGENT = 'Skynet-ERP-Copiloto/1.0 (Terminal de Transporte de Neiva; contacto: soporte interno)'

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

function recortar(texto, maximo = MAX_CARACTERES_FRAGMENTO) {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim()
  return limpio.length > maximo ? `${limpio.slice(0, maximo)}…` : limpio
}

/** Qué proveedor está configurado. Lo usa la documentación y el diagnóstico. */
export function proveedorActivo() {
  if (env.TAVILY_API_KEY) return 'tavily'
  if (env.BRAVE_SEARCH_API_KEY) return 'brave'
  return 'duckduckgo'
}

// ── Tavily ──────────────────────────────────────────────────────────────────
async function buscarTavily(consulta) {
  const res = await fetchConTimeout('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: env.TAVILY_API_KEY,
      query: consulta,
      max_results: MAX_RESULTADOS,
      // 'basic' y no 'advanced': advanced cuesta el doble de créditos y su
      // ventaja (extracción más profunda) no cambia la respuesta en preguntas
      // de una o dos frases, que es todo lo que llega por aquí.
      search_depth: 'basic',
      // La respuesta sintetizada del propio Tavily. No se usa como respuesta
      // final —eso lo hace Gemini, que conoce el contexto de la conversación—
      // pero le da al modelo un resumen ya destilado del que partir.
      include_answer: true,
    }),
  })
  if (!res.ok) throw new Error(`Tavily respondió ${res.status}`)
  const datos = await res.json()

  return {
    proveedor: 'tavily',
    resumen: datos.answer ? recortar(datos.answer) : undefined,
    resultados: (datos.results || []).slice(0, MAX_RESULTADOS).map((r) => ({
      titulo: r.title,
      url: r.url,
      fragmento: recortar(r.content),
    })),
  }
}

// ── Brave ───────────────────────────────────────────────────────────────────
async function buscarBrave(consulta) {
  const url =
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(consulta)}` +
    `&count=${MAX_RESULTADOS}&country=co&search_lang=es`
  const res = await fetchConTimeout(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': env.BRAVE_SEARCH_API_KEY },
  })
  if (!res.ok) throw new Error(`Brave respondió ${res.status}`)
  const datos = await res.json()

  return {
    proveedor: 'brave',
    resultados: (datos.web?.results || []).slice(0, MAX_RESULTADOS).map((r) => ({
      titulo: r.title,
      url: r.url,
      // Brave marca el término buscado con <strong> dentro del fragmento; el
      // modelo no necesita el marcado y gastaría tokens en él.
      fragmento: recortar(String(r.description || '').replace(/<[^>]+>/g, '')),
      publicado: r.age || undefined,
    })),
  }
}

// ── DuckDuckGo Instant Answer (modo degradado, sin key) ─────────────────────
async function buscarDuckDuckGo(consulta) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(consulta)}&format=json&no_html=1&skip_disambig=1`
  const res = await fetchConTimeout(url)
  if (!res.ok) throw new Error(`DuckDuckGo respondió ${res.status}`)
  const datos = await res.json()

  const resultados = []
  if (datos.AbstractText) {
    resultados.push({
      titulo: datos.Heading || consulta,
      url: datos.AbstractURL,
      fragmento: recortar(datos.AbstractText),
    })
  }
  // RelatedTopics trae entradas sueltas y también grupos anidados (`Topics`);
  // se aplanan porque para el modelo son todos candidatos por igual.
  for (const t of datos.RelatedTopics || []) {
    const sueltos = t.Topics || [t]
    for (const s of sueltos) {
      if (s.Text && resultados.length < MAX_RESULTADOS) {
        resultados.push({ titulo: s.Text.split(' - ')[0], url: s.FirstURL, fragmento: recortar(s.Text) })
      }
    }
  }

  return {
    proveedor: 'duckduckgo',
    resultados,
    // Esta nota viaja HASTA EL MODELO a propósito: sin ella, ante cero
    // resultados el modelo tiende a rellenar con lo que "recuerda" y a
    // presentarlo como si lo hubiera buscado. Diciéndole explícitamente que la
    // búsqueda es limitada, responde que no pudo confirmarlo.
    limitacion:
      'Modo básico sin API key: solo respuestas instantáneas, no búsqueda web completa. Si no hay resultados, dilo claramente y NO respondas de memoria como si lo hubieras buscado.',
  }
}

/**
 * Busca en la web. Nunca lanza: el que llama es una herramienta del modelo.
 *
 * @param {string} consulta
 * @returns {Promise<object>} `{proveedor, resultados[], resumen?}` o `{error}`
 */
export async function buscarWeb(consulta) {
  const termino = String(consulta || '').trim()
  if (!termino) return { error: 'Falta indicar qué buscar' }
  if (termino.length > 300) return { error: 'La consulta de búsqueda es demasiado larga' }

  const proveedor = proveedorActivo()

  try {
    const datos = await cacheHerramientas.through(
      `web:${proveedor}:${termino.toLowerCase()}`,
      async () => {
        if (proveedor === 'tavily') return buscarTavily(termino)
        if (proveedor === 'brave') return buscarBrave(termino)
        return buscarDuckDuckGo(termino)
      },
      TTL_BUSQUEDA_MS
    )

    if (!datos.resultados?.length) {
      return {
        proveedor,
        encontrado: false,
        mensaje: `No encontré resultados en la web para "${termino}". Dilo así, sin completar con lo que recuerdes.`,
        limitacion: datos.limitacion,
      }
    }
    return { ...datos, encontrado: true, consulta: termino }
  } catch (err) {
    // El proveedor configurado falló (key vencida, cuota agotada, red caída).
    // NO se cae en silencio al modo degradado: eso convertiría un problema de
    // configuración en respuestas silenciosamente peores durante semanas, sin
    // que nadie se entere. Se reporta el fallo y el modelo lo dice.
    console.error(`[copiloto] búsqueda web falló (${proveedor}):`, err.message)
    return {
      error:
        err.name === 'AbortError'
          ? 'La búsqueda web tardó demasiado'
          : `No se pudo completar la búsqueda web (${err.message})`,
    }
  }
}
