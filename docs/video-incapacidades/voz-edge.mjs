// Narración con una voz neuronal de Microsoft (las de Edge), en español de
// Colombia. Genera un WAV por escena de guion.json en narracion/, ya con el
// volumen normalizado (-16 LUFS, el estándar de video en línea), que es lo que
// lee componer.mjs.
//
//   node voz-edge.mjs                          (Salomé, todas las escenas)
//   node voz-edge.mjs --voz es-CO-GonzaloNeural --solo intro,cierre
//
// Nota: usa el servicio de voz de Edge (no oficial); el texto del guion se
// envía a Microsoft para sintetizarlo.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import ffmpeg from 'ffmpeg-static'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1] }
const VOZ = arg('voz', 'es-CO-SalomeNeural')
const VELOCIDAD = arg('velocidad', '-4%')
const SOLO = arg('solo') ? arg('solo').split(',') : null

const guion = JSON.parse(fs.readFileSync(path.join(aqui, 'guion.json'), 'utf8'))
const carpeta = path.join(aqui, 'narracion')
fs.mkdirSync(carpeta, { recursive: true })

const tts = new MsEdgeTTS()
await tts.setMetadata(VOZ, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)

for (const [i, escena] of guion.entries()) {
  if (SOLO && !SOLO.includes(escena.id)) continue
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'voz-'))
  let mp3
  for (let intento = 1; ; intento++) {
    try {
      ({ audioFilePath: mp3 } = await tts.toFile(tmp, escena.texto, { rate: VELOCIDAD }))
      break
    } catch (err) {
      if (intento >= 3) throw err
      await new Promise((r) => setTimeout(r, 3000))
    }
  }
  const wav = path.join(carpeta, `${String(i + 1).padStart(2, '0')}-${escena.id}.wav`)
  // Volumen: todas las escenas al mismo nivel, alto y sin saturar.
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', mp3, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', wav])
  if (r.status !== 0) throw new Error(`ffmpeg falló con ${escena.id}`)
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log(`${String(i + 1).padStart(2, '0')} ${escena.id} · ${((fs.statSync(wav).size - 44) / 48000).toFixed(1)} s`)
}
tts.close()
console.log(`Listo: voz ${VOZ}`)
