import { GoogleGenAI } from '@google/genai'
import { env } from '../../config/env.js'
import { pcm16ToWav } from '../../utils/wav.js'
import { reservarTurnoTts, registrarRechazoExternoTts, registrarAgotamientoDiarioTts } from './avisos.ttsCuota.js'
import { esVozTtsValida, VOZ_TTS_DEFECTO } from './vocesTts.js'
import { ErrorAplicacion, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { logger } from '../../config/logger.js'

const MODELO_TTS = 'gemini-2.5-flash-preview-tts'
// Mismo criterio que copiloto.service.js#TIMEOUT_MODELO_MS: la síntesis de
// voz puede tardar un poco más que un turno de chat corto (genera audio, no
// solo texto), así que se le da más margen antes de darla por colgada.
const TIMEOUT_TTS_MS = Number(process.env.GEMINI_TTS_TIMEOUT_MS) || 20_000

// El SDK de @google/genai NO lanza un objeto de error estructurado: `err.message`
// es el CUERPO JSON crudo de la respuesta de Google, como texto (verificado
// contra la API real: `{"error":{"code":429,"message":"...","status":
// "RESOURCE_EXHAUSTED","details":[...]}}`). Dejar que eso llegue tal cual al
// panel de administración es justamente el bug reportado: un JSON de 500+
// caracteres en el idioma y formato internos de Google, ilegible para
// cualquiera que no sea quien escribió este archivo. Esta función lo
// interpreta para poder distinguir CUÁL de las dos cuotas se agotó (por
// minuto vs por día, ver avisos.ttsCuota.js) y devolver siempre un mensaje
// en español que un administrador pueda entender y accionar.
function interpretarErrorGemini(err) {
  let cuerpo
  try {
    cuerpo = JSON.parse(err.message)
  } catch {
    return { esCuota: false, esDiaria: false }
  }

  const info = cuerpo?.error
  if (!info || (info.status !== 'RESOURCE_EXHAUSTED' && info.code !== 429)) {
    return { esCuota: false, esDiaria: false }
  }

  const violacion = info.details
    ?.find((d) => d['@type']?.includes('QuotaFailure'))
    ?.violations?.[0]
  const quotaId = violacion?.quotaId || ''

  return { esCuota: true, esDiaria: quotaId.includes('PerDay') }
}

let cliente = null
function obtenerCliente() {
  if (!env.GEMINI_API_KEY) {
    // ErrorConflicto (409, no 503/500): errorHandler.js oculta el mensaje de
    // cualquier error >=500 por seguridad (podría filtrar detalles internos
    // de un error no controlado) — este SÍ es un mensaje seguro y pensado
    // para mostrarse, mismo criterio que copiloto.service.js#obtenerCliente
    // para el mismo caso ("falta GEMINI_API_KEY").
    throw new ErrorConflicto('La generación de voz institucional no está configurada: falta GEMINI_API_KEY en el servidor.')
  }
  if (!cliente) {
    cliente = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: TIMEOUT_TTS_MS } })
  }
  return cliente
}

// Genera el audio (WAV, PCM 16-bit/24kHz/mono) de un texto con una de las
// voces institucionales del catálogo (ver vocesTts.js). Lanza SIEMPRE con un
// ErrorAplicacion de mensaje ya traducido a español (ver
// interpretarErrorGemini arriba) en cualquier fallo (cuota agotada, texto
// rechazado, timeout, API caída) — el llamador decide qué hacer con eso:
// crearYTransmitirAviso() en avisos.service.js lo atrapa y sigue SIN audio
// generado (cada dispositivo cae a su propia voz local), mientras que el
// endpoint de "probar voz" deja que ese mensaje (ya presentable) llegue al
// administrador, que sí necesita saber que la prueba falló y por qué.
export async function generarAudioVoz(texto, voz = VOZ_TTS_DEFECTO) {
  if (!texto || !texto.trim()) {
    throw new ErrorValidacion('No hay texto para generar la voz')
  }
  if (!esVozTtsValida(voz)) {
    throw new ErrorValidacion(`Voz institucional desconocida: "${voz}"`)
  }

  reservarTurnoTts()

  const ai = obtenerCliente()
  let response
  try {
    response = await ai.models.generateContent({
      model: MODELO_TTS,
      contents: [{ parts: [{ text: texto }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voz } } },
      },
    })
  } catch (err) {
    const { esCuota, esDiaria } = interpretarErrorGemini(err)

    if (esCuota) {
      if (esDiaria) {
        registrarAgotamientoDiarioTts()
        throw new ErrorAplicacion(
          'Se alcanzó el límite gratuito diario de generación de voz institucional. Vuelve a intentarlo más tarde, o transmite igual: cada dispositivo leerá el aviso con su propia voz.',
          429
        )
      }
      registrarRechazoExternoTts()
      throw new ErrorAplicacion('Se alcanzó el límite de generación de voz institucional por ahora. Espera un momento e inténtalo de nuevo.', 429)
    }

    // Cualquier otro fallo (timeout, texto rechazado por el modelo, API
    // caída, etc.): se registra el detalle real para diagnóstico, pero
    // NUNCA se deja pasar tal cual al administrador — ver comentario de
    // interpretarErrorGemini() sobre por qué err.message no es presentable.
    // ErrorConflicto (409), no un 5xx: ver la nota en obtenerCliente() de
    // arriba sobre por qué un mensaje propio y seguro necesita quedar por
    // debajo de 500 para que errorHandler.js no lo reemplace.
    logger.warn('Fallo generando audio de voz institucional con Gemini', { error: err.message })
    throw new ErrorConflicto('No se pudo generar la voz institucional en este momento. Inténtalo de nuevo en unos minutos.')
  }

  const parte = response.candidates?.[0]?.content?.parts?.[0]?.inlineData
  if (!parte?.data) {
    throw new ErrorConflicto('El modelo de voz no devolvió audio')
  }

  // El SDK entrega el PCM crudo en base64 (mimeType típico
  // "audio/L16;codec=pcm;rate=24000" — 16-bit, mono, 24kHz, verificado
  // contra la API real): hay que envolverlo en WAV para que sea reproducible.
  const pcm = Buffer.from(parte.data, 'base64')
  const wav = pcm16ToWav(pcm, { sampleRate: 24000, numChannels: 1 })
  return { data: wav, mimeType: 'audio/wav' }
}
