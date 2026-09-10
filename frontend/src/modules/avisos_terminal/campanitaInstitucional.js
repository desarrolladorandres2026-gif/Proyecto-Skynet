// Señal sonora institucional que abre cada Aviso Terminal de Neiva: una
// campanita corta (estilo anuncio de terminal/aeropuerto), NUNCA una alarma.
//
// Se intenta primero un archivo dedicado (announcement-chime.mp3): si algún
// día se produce un sonido institucional a medida, basta con dejarlo en
// frontend/public/sounds/announcement-chime.mp3 y este código lo recoge solo,
// sin tocar el resto del flujo. Mientras ese archivo no exista (hoy: 404), el
// <audio> dispara su evento 'error' y se cae a una campanita SINTETIZADA por
// Web Audio API — dos tonos descendentes con envolvente de campana (ataque
// rápido, caída exponencial), que suena a timbre institucional y no depende
// de ningún asset binario para funcionar de verdad hoy mismo.
const RUTA_ARCHIVO_DEDICADO = '/sounds/announcement-chime.mp3'

// Un solo AudioContext para toda la sesión: crear uno nuevo cada vez que
// suena un aviso es innecesario y en algunos navegadores cuenta contra el
// límite de contextos concurrentes. Se crea perezosamente (no en el import)
// porque instanciar un AudioContext antes de cualquier gesto del usuario
// queda en estado 'suspended' en Chrome/Safari hasta que haya interacción.
let contextoAudio = null
function obtenerContexto() {
  if (!contextoAudio) {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) return null
    contextoAudio = new Ctor()
  }
  return contextoAudio
}

// Un tono de "campana": ataque casi instantáneo y caída exponencial (no
// lineal — así es como decae una campana real, y es lo que separa un
// "ding" limpio de un pitido plano de videojuego). Se suma un segundo
// oscilador a 2x la frecuencia con menos ganancia: ese armónico es lo que da
// timbre metálico de campana en vez de sonar a flauta.
function tocarCampana(ctx, destino, frecuencia, inicio, duracion, ganancia) {
  const fundamental = ctx.createOscillator()
  const armonico = ctx.createOscillator()
  const envolvente = ctx.createGain()

  fundamental.type = 'sine'
  fundamental.frequency.value = frecuencia
  armonico.type = 'sine'
  armonico.frequency.value = frecuencia * 2

  const gananciaArmonico = ctx.createGain()
  gananciaArmonico.gain.value = 0.25
  armonico.connect(gananciaArmonico)
  gananciaArmonico.connect(envolvente)
  fundamental.connect(envolvente)
  envolvente.connect(destino)

  envolvente.gain.setValueAtTime(0, inicio)
  envolvente.gain.linearRampToValueAtTime(ganancia, inicio + 0.02)
  envolvente.gain.exponentialRampToValueAtTime(0.001, inicio + duracion)

  fundamental.start(inicio)
  armonico.start(inicio)
  fundamental.stop(inicio + duracion + 0.05)
  armonico.stop(inicio + duracion + 0.05)
}

// Dos notas descendentes (mi5 -> si4, un intervalo de cuarta muy asociado a
// timbres de aviso/anuncio institucional — NO la sirena de dos tonos alternos
// que se asocia a alarma/emergencia, y NO un solo "beep" que se confunde con
// notificación genérica de celular). ~1.2s en total, dentro del rango pedido
// de 1-2s.
function reproducirCampanitaSintetizada(volumen) {
  const ctx = obtenerContexto()
  if (!ctx) return Promise.resolve()

  const listo = ctx.state === 'suspended' ? ctx.resume().catch(() => {}) : Promise.resolve()
  return listo.then(
    () =>
      new Promise((resolve) => {
        const maestro = ctx.createGain()
        maestro.gain.value = Math.min(1, Math.max(0, volumen))
        maestro.connect(ctx.destination)

        const ahora = ctx.currentTime + 0.03
        tocarCampana(ctx, maestro, 1318.51, ahora, 0.55, 0.6) // Mi6
        tocarCampana(ctx, maestro, 987.77, ahora + 0.32, 0.7, 0.5) // Si5

        // No hay un evento nativo de "el bus entero terminó de sonar": se
        // resuelve con un temporizador que cubre el último ataque + su caída.
        setTimeout(resolve, 1100)
      })
  )
}

// Si ya se comprobó en esta sesión que RUTA_ARCHIVO_DEDICADO no existe (404),
// no tiene sentido volver a pedirlo por red en CADA aviso institucional del
// día — se salta directo a la campanita sintetizada. `null` = todavía no se
// sabe; se resuelve la primera vez que se reproduce un aviso.
let archivoDedicadoDisponible = null

// Tope duro para el intento del archivo dedicado: sin esto, un <audio> hacia
// un recurso 404 puede disparar el evento 'error' Y el rechazo de
// audio.play() por separado (llamando dos veces a la campanita sintetizada,
// una encima de la otra) o, en algunos WebView/Safari viejos, NINGUNO de los
// dos de forma confiable — dejando esta promesa colgada para siempre. Como
// el aviso entero espera a que la campanita termine antes de hablar (ver
// useAnuncioVoz.js), una campanita colgada significaba un Aviso Terminal de
// Neiva que nunca llegaba a reproducirse ni a liberar la cola automática
// del siguiente aviso — el bug real detrás de "el aviso se queda pendiente
// hasta reabrir la app" (auditoría 2026-09-10).
const TIMEOUT_ARCHIVO_DEDICADO_MS = 800

// `volumen` en 0-1, relativo al volumen multimedia del dispositivo (nunca
// toca el volumen del sistema — ver requisitos de audibilidad). Devuelve una
// promesa que se resuelve cuando la campanita terminó de sonar, para que el
// llamador pueda encadenar la pausa + la voz después. GARANTIZADO a resolver
// (nunca queda colgada ni dispara dos veces la sintetizada) gracias al
// flag `decidido` de una sola vía y al timeout de arriba.
export function reproducirCampanita({ volumen = 0.8 } = {}) {
  if (archivoDedicadoDisponible === false) {
    return reproducirCampanitaSintetizada(volumen)
  }

  return new Promise((resolve) => {
    let decidido = false

    const irASintetizada = () => {
      if (decidido) return
      decidido = true
      archivoDedicadoDisponible = false
      reproducirCampanitaSintetizada(volumen).then(resolve)
    }
    const terminarConExito = () => {
      if (decidido) return
      decidido = true
      archivoDedicadoDisponible = true
      resolve()
    }

    const audio = new Audio(RUTA_ARCHIVO_DEDICADO)
    audio.volume = Math.min(1, Math.max(0, volumen))
    audio.addEventListener('ended', terminarConExito, { once: true })
    audio.addEventListener('error', irASintetizada, { once: true })
    audio.play().catch(irASintetizada)
    setTimeout(irASintetizada, TIMEOUT_ARCHIVO_DEDICADO_MS)
  })
}
