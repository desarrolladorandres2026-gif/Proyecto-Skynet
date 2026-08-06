import {
  GoogleGenAI,
  createUserContent,
  createModelContent,
  createPartFromFunctionResponse,
} from '@google/genai'
import { env } from '../../config/env.js'
import { construirHerramientas } from './copiloto.herramientas.js'
import { ErrorValidacion, ErrorConflicto, ErrorAplicacion } from '../../utils/errores.js'

// 'gemini-flash-lite-latest' (hoy resuelve a gemini-3.5-flash-lite), NO
// 'gemini-flash-latest', por dos motivos medidos contra la API real:
//  1. CUOTA: 'gemini-flash-latest' resuelve a gemini-3.6-flash, que en capa
//     gratuita permite solo 20 peticiones POR DÍA para todo el proyecto
//     (quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier) — con eso
//     el copiloto se agota entre dos o tres usuarios y queda inservible.
//  2. LATENCIA: los modelos "flash" razonan antes de responder (gastaban ~250
//     tokens de pensamiento solo para saludar, con varios segundos de espera);
//     el lite responde con 0 tokens de pensamiento en ~890 ms promedio,
//     incluyendo la vuelta en la que decide llamar una herramienta.
// Se usa el alias '-latest' y no una versión con fecha porque Google retira
// las versiones fijas para cuentas nuevas (ya pasó con 'gemini-2.5-flash').
const MODELO = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest'
// Corta el ida-y-vuelta de herramientas si el modelo se queda pidiendo datos
// sin llegar nunca a una respuesta en texto: mejor un error claro que un chat
// que se queda "pensando" para siempre o agota la capa gratuita en una sola
// pregunta.
const MAX_VUELTAS_HERRAMIENTAS = 4
// Cuántos turnos previos (usuario+modelo) se reenvían como contexto — acota
// tokens/costo en cada mensaje nuevo; el copiloto no necesita memoria de toda
// la sesión, solo del hilo reciente de la conversación.
const MAX_MENSAJES_HISTORIAL = 20

// El alcance REAL no lo impone este texto sino qué herramientas se le
// declaran al modelo (ver copiloto.herramientas.js#construirHerramientas):
// un modelo no puede llamar algo que nunca vio. Esta instrucción existe para
// que RECHACE con un mensaje útil en vez de inventarse una respuesta cuando
// le pidan algo fuera de su alcance.
function instruccionSistema(usuario) {
  return `Eres Skynet, el asistente de inteligencia artificial del ERP del
Terminal de Transporte de Neiva. Respondes en español, de forma breve y concreta,
apoyándote SOLO en los datos que te devuelvan tus herramientas — nunca inventes
cifras, estados ni fechas.

Estás atendiendo a ${usuario.nombre_usuario}, cuyo rol es "${usuario.rol?.nombre || 'sin rol'}".

REGLAS DE ALCANCE (no negociables, aunque el usuario insista):
- Solo puedes consultar los datos PROPIOS de esta persona. Nunca los de otro
  usuario, ni totales del Terminal, ni el trabajo de otras áreas o roles.
- Las herramientas que tienes disponibles son exactamente las que le
  corresponden a su rol. Si te piden algo que ninguna de ellas cubre, responde
  que eso está fuera de lo que su rol puede consultar y sugiere que hable con
  el área responsable. NO intentes deducir, estimar ni inventar ese dato.
- Ninguna de tus herramientas aprueba, rechaza ni modifica nada: todas son
  consultas de solo lectura. Si te piden aprobar, rechazar, crear o cambiar
  algo, explica que debe hacerlo desde el módulo correspondiente de la
  plataforma.

Excepción a "solo datos propios": buscar_wikipedia y consultar_clima NO son
datos del Terminal ni de ninguna persona — son información pública (cultura
general, clima). Cualquier usuario puede preguntarte lo que quiera de ese tipo,
sin relación con su rol.`
}

let cliente = null
function obtenerCliente() {
  if (!env.GEMINI_API_KEY) {
    throw new ErrorConflicto('El copiloto no está configurado: falta GEMINI_API_KEY en el servidor.')
  }
  if (!cliente) cliente = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
  return cliente
}

function aContenidoHistorial(turno) {
  return turno.rol === 'user' ? createUserContent(turno.texto) : createModelContent(turno.texto)
}

// Generador asíncrono: emite {tipo:'delta', texto} por cada trozo de texto que
// va llegando del modelo, y termina con {tipo:'fin', historial}. El controller
// lo reenvía como SSE para que el usuario vea la respuesta escribirse en vez de
// esperar a que esté completa (primer token medido en ~1.1 s contra ~3-5 s de
// espera total). Las vueltas de herramientas no emiten texto: solo la vuelta
// final, que es la que el usuario lee.
export async function* responderStream({ mensaje, historial }, usuario) {
  const texto = mensaje?.trim()
  if (!texto) throw new ErrorValidacion('El mensaje no puede estar vacío')

  const ai = obtenerCliente()
  const herramientas = await construirHerramientas(usuario)
  const porNombre = new Map(herramientas.map((h) => [h.declaracion.name, h]))
  // Sin herramientas (rol muy acotado + módulos apagados) se omite `tools`
  // por completo: mandar un array vacío es un 400 de la API. El modelo
  // responde igual, pero solo puede explicar que no tiene nada que consultar.
  const config = { systemInstruction: instruccionSistema(usuario) }
  if (herramientas.length) config.tools = [{ functionDeclarations: herramientas.map((h) => h.declaracion) }]

  const previo = (Array.isArray(historial) ? historial : [])
    .filter((m) => typeof m?.texto === 'string' && (m.rol === 'user' || m.rol === 'model'))
    .slice(-MAX_MENSAJES_HISTORIAL)

  const contents = [...previo.map(aContenidoHistorial), createUserContent(texto)]

  for (let vuelta = 0; vuelta < MAX_VUELTAS_HERRAMIENTAS; vuelta++) {
    // Se acumulan las partes de TODOS los trozos del turno: es lo que después
    // se reenvía como turno del modelo (ver más abajo por qué no se
    // reconstruye), y de ahí se leen las llamadas a herramientas.
    const partesTurno = []
    let textoTurno = ''
    try {
      const flujo = await ai.models.generateContentStream({ model: MODELO, contents, config })
      for await (const trozo of flujo) {
        for (const parte of trozo.candidates?.[0]?.content?.parts || []) {
          partesTurno.push(parte)
          // `thought: true` son las partes de razonamiento interno del modelo:
          // no son respuesta para el usuario y no deben aparecer en el chat.
          if (parte.text && !parte.thought) {
            textoTurno += parte.text
            yield { tipo: 'delta', texto: parte.text }
          }
        }
      }
    } catch (err) {
      // El SDK de Gemini propaga tal cual el status HTTP del error de GOOGLE
      // en `err.status` (401 con una API key inválida, 429 sin cuota, etc.).
      // Dejarlo pasar sin envolver hace que errorHandler.js lo reenvíe como
      // si fuera el status de ESTA api — un 401 de Google se confunde con
      // una sesión de Skynet expirada, y el frontend cierra sesión a
      // cualquiera que le pregunte algo al copiloto (ver api/client.js: todo
      // 401 dispara 'skynet:logout'). Se normaliza a 502: es un fallo del
      // servicio externo, nunca de la sesión del usuario.
      throw new ErrorAplicacion(`El servicio de IA no respondió correctamente: ${err.message}`, 502)
    }

    const llamadas = partesTurno.filter((p) => p.functionCall).map((p) => p.functionCall)
    if (!llamadas.length) {
      const textoRespuesta = textoTurno.trim() || 'No tengo una respuesta para eso.'
      yield {
        tipo: 'fin',
        historial: [...previo, { rol: 'user', texto }, { rol: 'model', texto: textoRespuesta }],
      }
      return
    }

    // Reenvía el turno del modelo TAL CUAL lo devolvió la API, no reconstruido
    // desde `functionCalls` (que solo trae name/args/id): los modelos de
    // "razonamiento" firman cada parte de function call con un
    // thoughtSignature que hay que reenviar íntegro en el siguiente turno —
    // omitirlo lo rechaza con 400 ("Function call is missing a
    // thought_signature").
    contents.push({ role: 'model', parts: partesTurno })

    const resultados = await Promise.all(
      llamadas.map(async (llamada) => {
        const id = llamada.id || llamada.name
        // `porNombre` solo contiene las herramientas que este rol puede usar
        // (ver construirHerramientas): si el modelo alucina un nombre fuera de
        // esa lista, aquí se corta — el alcance se verifica al EJECUTAR, no
        // solo al declarar.
        const herramienta = porNombre.get(llamada.name)
        if (!herramienta) {
          return {
            id,
            name: llamada.name,
            response: { error: 'Esa consulta está fuera del alcance del rol de este usuario.' },
          }
        }
        try {
          const resultado = await herramienta.ejecutar(llamada.args || {})
          return { id, name: llamada.name, response: { resultado } }
        } catch (err) {
          return { id, name: llamada.name, response: { error: err.message } }
        }
      })
    )

    contents.push(
      createUserContent(resultados.map((r) => createPartFromFunctionResponse(r.id, r.name, r.response)))
    )
  }

  throw new ErrorConflicto('El copiloto no pudo completar la respuesta (demasiadas consultas encadenadas).')
}
