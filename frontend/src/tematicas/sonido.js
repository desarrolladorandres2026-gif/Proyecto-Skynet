import { SONIDO_AL_INICIAR_SESION, TEMATICAS_ACTIVAS } from './config.js'
import { cargarTematica, tematicaActual } from './useTematica.js'

// Sonido de bienvenida de la temática, sintetizado con Web Audio: no hay
// archivos de audio que descargar ni licenciar. La temática lo declara como
// datos: sonidoLogin: { tempo: 200, notas: [['E5', 1], ['G5', 0.5], …] }
// (nota en notación científica, duración en tiempos; 'R' = silencio).

const SEMITONOS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

// 'E5' → 659.26 Hz, 'F#4', 'Bb3'. Devuelve null para silencio o nota inválida.
export function frecuenciaDeNota(nota) {
  const m = /^([A-G])([#b]?)(\d)$/.exec(nota)
  if (!m) return null
  const [, letra, alteracion, octava] = m
  const semitonos =
    SEMITONOS[letra] + (alteracion === '#' ? 1 : alteracion === 'b' ? -1 : 0) + (Number(octava) + 1) * 12
  return 440 * 2 ** ((semitonos - 69) / 12)
}

// Convierte la melodía en eventos { inicio, duracion, frecuencia } (segundos).
export function programarMelodia({ tempo = 120, notas = [] }) {
  const tiempo = 60 / tempo
  const eventos = []
  let t = 0
  for (const [nota, beats] of notas) {
    const duracion = beats * tiempo
    const frecuencia = frecuenciaDeNota(nota)
    if (frecuencia) eventos.push({ inicio: t, duracion, frecuencia })
    t += duracion
  }
  return eventos
}

// Duración total (s) de la melodía, incluidos los silencios.
export function duracionMelodia({ tempo = 120, notas = [] }) {
  return notas.reduce((total, [, beats]) => total + beats, 0) * (60 / tempo)
}

let contexto = null

// Debe llamarse DENTRO del gesto del usuario (el clic de "Ingresar"): los
// navegadores solo dejan arrancar el audio tras una interacción.
export function prepararAudio() {
  if (!TEMATICAS_ACTIVAS || !SONIDO_AL_INICIAR_SESION) return
  try {
    contexto ??= new (window.AudioContext || window.webkitAudioContext)()
    contexto.resume?.()
  } catch {
    /* sin Web Audio */
  }
}

// Tono de campanita: fundamental + parcial inarmónico, con ataque rápido y
// caída exponencial. Con `grave`, la nota se dobla una octava abajo
// (triángulo) para que suene lleno.
function campanada(ctx, destino, { inicio, duracion, frecuencia }, t0, grave) {
  const fin = t0 + inicio + Math.max(duracion, 0.25) + 0.5
  const voces = [[frecuencia, 'sine', 1], [frecuencia * 2.76, 'sine', 0.3]]
  if (grave) voces.push([frecuencia / 2, 'triangle', 0.7])
  for (const [hz, tipo, ganancia] of voces) {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = tipo
    osc.frequency.value = hz
    g.gain.setValueAtTime(0.0001, t0 + inicio)
    g.gain.exponentialRampToValueAtTime(ganancia, t0 + inicio + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, fin)
    osc.connect(g).connect(destino)
    osc.start(t0 + inicio)
    osc.stop(fin + 0.05)
  }
}

// Cascabeles de trineo: ráfagas cortas de ruido agudo, una por medio tiempo.
function cascabeles(ctx, destino, t0, total, tempo) {
  const largo = Math.floor(ctx.sampleRate * 0.09)
  const buffer = ctx.createBuffer(1, largo, ctx.sampleRate)
  const datos = buffer.getChannelData(0)
  for (let i = 0; i < largo; i++) datos[i] = Math.random() * 2 - 1
  const paso = 30 / tempo // medio tiempo
  for (let t = 0, n = 0; t < total; t += paso, n++) {
    const fuente = ctx.createBufferSource()
    fuente.buffer = buffer
    const filtro = ctx.createBiquadFilter()
    filtro.type = 'bandpass'
    filtro.frequency.value = 7500
    filtro.Q.value = 1.2
    const g = ctx.createGain()
    const fuerza = n % 2 === 0 ? 0.5 : 0.28 // acento en el tiempo fuerte
    g.gain.setValueAtTime(fuerza, t0 + t)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + 0.09)
    fuente.connect(filtro).connect(g).connect(destino)
    fuente.start(t0 + t)
  }
}

// Tras un inicio de sesión exitoso: trae la temática global ya con sesión y,
// si trae sonido, lo reproduce. Nunca lanza ni bloquea el login.
export async function sonarInicioSesion() {
  if (!TEMATICAS_ACTIVAS || !SONIDO_AL_INICIAR_SESION || !contexto) return
  try {
    await cargarTematica()
    const melodia = tematicaActual()?.sonidoLogin
    if (!melodia) return
    await contexto.resume?.()
    if (contexto.state !== 'running') return // el navegador no lo permitió
    // Volumen alto pero sin distorsionar: el compresor frena los picos.
    const master = contexto.createGain()
    master.gain.value = 0.9
    const compresor = contexto.createDynamicsCompressor()
    master.connect(compresor).connect(contexto.destination)
    const t0 = contexto.currentTime + 0.05
    programarMelodia(melodia).forEach((e) => campanada(contexto, master, e, t0, melodia.doblarOctava))
    if (melodia.cascabeles) cascabeles(contexto, master, t0, duracionMelodia(melodia), melodia.tempo)
  } catch {
    /* el sonido es decorativo */
  }
}
