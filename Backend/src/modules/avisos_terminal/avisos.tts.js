import { GoogleGenAI } from '@google/genai'
import { env } from '../../config/env.js'
import { pcm16ToWav } from '../../utils/wav.js'
import { reservarTurnoTts, registrarRechazoExternoTts } from './avisos.ttsCuota.js'
import { esVozTtsValida, VOZ_TTS_DEFECTO } from './vocesTts.js'
import { ErrorAplicacion, ErrorValidacion } from '../../utils/errores.js'

const MODELO_TTS = 'gemini-2.5-flash-preview-tts'
// Mismo criterio que copiloto.service.js#TIMEOUT_MODELO_MS: la síntesis de
// voz puede tardar un poco más que un turno de chat corto (genera audio, no
// solo texto), así que se le da más margen antes de darla por colgada.
const TIMEOUT_TTS_MS = Number(process.env.GEMINI_TTS_TIMEOUT_MS) || 20_000

let cliente = null
function obtenerCliente() {
  if (!env.GEMINI_API_KEY) {
    throw new ErrorAplicacion('La generación de voz institucional no está configurada: falta GEMINI_API_KEY en el servidor.', 503)
  }
  if (!cliente) {
    cliente = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: { timeout: TIMEOUT_TTS_MS } })
  }
  return cliente
}

// Genera el audio (WAV, PCM 16-bit/24kHz/mono) de un texto con una de las
// voces institucionales del catálogo (ver vocesTts.js). Lanza en cualquier
// fallo (cuota agotada, texto rechazado, timeout, API caída) — el llamador
// decide qué hacer con eso: crearYTransmitirAviso() en avisos.service.js lo
// atrapa y sigue SIN audio generado (cada dispositivo cae a su propia voz
// local), mientras que el endpoint de "probar voz" deja que el error llegue
// tal cual al administrador, que sí necesita saber que la prueba falló.
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
    if (err.status === 429 || err.code === 429) registrarRechazoExternoTts()
    throw err
  }

  const parte = response.candidates?.[0]?.content?.parts?.[0]?.inlineData
  if (!parte?.data) {
    throw new ErrorAplicacion('El modelo de voz no devolvió audio', 502)
  }

  // El SDK entrega el PCM crudo en base64 (mimeType típico
  // "audio/L16;codec=pcm;rate=24000" — 16-bit, mono, 24kHz, verificado
  // contra la API real): hay que envolverlo en WAV para que sea reproducible.
  const pcm = Buffer.from(parte.data, 'base64')
  const wav = pcm16ToWav(pcm, { sampleRate: 24000, numChannels: 1 })
  return { data: wav, mimeType: 'audio/wav' }
}
