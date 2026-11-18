// Narración con la MISMA voz institucional de "Avisos Terminal de Neiva":
// Gemini TTS (gemini-2.5-flash-preview-tts), voz "Kore" (firme y clara), con la
// GEMINI_API_KEY del backend. Genera un WAV por escena de guion.json en
// narracion/, que es lo que lee componer.mjs.
//
//   node voz-gemini.mjs            (todas las escenas)
//   node voz-gemini.mjs --voz Kore --solo intro,cierre
//
// El plan gratuito de Gemini limita las peticiones por minuto: si responde 429
// se espera lo que indica Google y se reintenta. Si el límite es el DIARIO, se
// detiene y avisa (las escenas ya generadas se conservan).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const backend = path.resolve(aqui, '..', '..', 'Backend')
const requerir = createRequire(path.join(backend, 'package.json'))
const { GoogleGenAI } = await import(pathToFileURL(requerir.resolve('@google/genai')).href)
const dotenv = requerir('dotenv')
dotenv.config({ path: path.join(backend, '.env'), quiet: true })
const { pcm16ToWav } = await import(pathToFileURL(path.join(backend, 'src', 'utils', 'wav.js')).href)

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1] }
const VOZ = arg('voz', 'Kore')
const SOLO = arg('solo') ? arg('solo').split(',') : null
const MODELO = arg('modelo', 'gemini-2.5-flash-preview-tts')

if (!process.env.GEMINI_API_KEY) throw new Error('Falta GEMINI_API_KEY en Backend/.env')
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, httpOptions: { timeout: 60_000 } })
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function sintetizar(texto) {
  for (let intento = 1; intento <= 8; intento++) {
    try {
      const r = await ai.models.generateContent({
        model: MODELO,
        contents: [{ parts: [{ text: texto }] }],
        config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ } } } },
      })
      const parte = r.candidates?.[0]?.content?.parts?.[0]?.inlineData
      if (!parte?.data) throw new Error('El modelo no devolvió audio')
      return pcm16ToWav(Buffer.from(parte.data, 'base64'), { sampleRate: 24000, numChannels: 1 })
    } catch (err) {
      let info = null
      try { info = JSON.parse(err.message)?.error } catch { /* no es JSON */ }
      const esCuota = info?.code === 429 || info?.status === 'RESOURCE_EXHAUSTED'
      if (!esCuota) {
        if (intento < 3) { await dormir(4000); continue }
        throw new Error(`Fallo de Gemini: ${(info?.message || err.message).slice(0, 200)}`)
      }
      const violacion = info.details?.find((d) => d['@type']?.includes('QuotaFailure'))?.violations?.[0]
      if (violacion?.quotaId?.includes('PerDay')) throw new Error('Se agotó la cuota DIARIA de voz de Gemini. Vuelve a ejecutar mañana (se conservan las escenas ya generadas).')
      const espera = Number(/(\d+)/.exec(info.details?.find((d) => d['@type']?.includes('RetryInfo'))?.retryDelay || '')?.[1] || 30)
      console.log(`  límite por minuto: espero ${espera + 2} s…`)
      await dormir((espera + 2) * 1000)
    }
  }
  throw new Error('Demasiados reintentos')
}

const guion = JSON.parse(fs.readFileSync(path.join(aqui, 'guion.json'), 'utf8'))
const carpeta = path.join(aqui, 'narracion')
fs.mkdirSync(carpeta, { recursive: true })
for (const [i, escena] of guion.entries()) {
  if (SOLO && !SOLO.includes(escena.id)) continue
  const archivo = path.join(carpeta, `${String(i + 1).padStart(2, '0')}-${escena.id}.wav`)
  const wav = await sintetizar(escena.texto)
  fs.writeFileSync(archivo, wav)
  console.log(`${String(i + 1).padStart(2, '0')} ${escena.id} · ${(wav.length / 48000).toFixed(1)} s`)
}
console.log(`Listo: voz ${VOZ}`)
