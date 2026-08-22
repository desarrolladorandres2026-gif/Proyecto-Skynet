import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { plataforma } from '../api/plataforma.js'

const PlataformaContext = createContext(null)

// ── Cadencia del sondeo ─────────────────────────────────────────────────────
// No hay WebSocket ni SSE bidireccional en Skynet (el único SSE es el stream
// de respuesta del copiloto, que va en un solo sentido y por POST), así que
// esto es polling. La clave para que no sea un desperdicio es que la
// frecuencia dependa de qué tan cerca está el próximo cambio de estado: la
// inmensa mayoría del tiempo no hay nada programado y basta con un latido muy
// espaciado.
//
// Con ~25 personas conectadas eso son ~12 peticiones por minuto en reposo
// contra un endpoint que se sirve de una caché en memoria de 5s sin tocar
// Mongo. El pico (15s) solo ocurre durante la ventana de mantenimiento, que
// es exactamente cuando nadie más está usando el backend.
const MS = { SEGUNDO: 1000, MINUTO: 60_000 }

export function intervaloDeSondeo(estado, ahoraMs) {
  if (!estado) return 30 * MS.SEGUNDO

  if (estado.status === 'en_mantenimiento') {
    // Durante el mantenimiento la gente está mirando la pantalla esperando
    // volver: 15s es lo que separa "volvió al instante" de "tuve que recargar".
    return 15 * MS.SEGUNDO
  }

  if (estado.status === 'programado' && estado.scheduledStart) {
    const faltan = new Date(estado.scheduledStart).getTime() - ahoraMs
    // En los últimos 2 minutos se acelera para que la transición a la pantalla
    // de mantenimiento se sienta puntual y no con medio minuto de retraso.
    if (faltan <= 2 * MS.MINUTO) return 10 * MS.SEGUNDO
    if (faltan <= 15 * MS.MINUTO) return 30 * MS.SEGUNDO
    return 60 * MS.SEGUNDO
  }

  // Operativa y sin nada programado: latido barato. Si un administrador
  // programa o activa algo, el usuario se entera como muy tarde en 2 minutos
  // — y de inmediato si hace cualquier acción (el 503 dispara el evento
  // global) o si vuelve a la pestaña.
  return 2 * MS.MINUTO
}

export function PlataformaProvider({ children }) {
  const [estado, setEstado] = useState(null)
  const [cargando, setCargando] = useState(true)

  // ── Ancla de reloj ────────────────────────────────────────────────────────
  // La cuenta regresiva se calcula contra el reloj DEL SERVIDOR, no el del
  // dispositivo. En las tablets de operación del Terminal es habitual
  // encontrar la hora corrida varios minutos (y a veces el huso mal puesto);
  // con el reloj local, el contador mostraría un tiempo restante que no tiene
  // ninguna relación con cuándo va a caerse la plataforma de verdad.
  //
  // El servidor manda `ahora` en cada respuesta; aquí se guarda la diferencia
  // contra el reloj local y se corrige en todos los cálculos posteriores.
  const desfaseRef = useRef(0)

  const consultar = useCallback(async () => {
    try {
      const { estado: nuevo } = await plataforma.estado()
      if (nuevo?.ahora) {
        desfaseRef.current = new Date(nuevo.ahora).getTime() - Date.now()
      }
      setEstado(nuevo)
      return nuevo
    } catch {
      // Silencioso a propósito: si esta sonda falla (red caída, backend
      // reiniciándose) NO se toca el estado que ya había. Poner null aquí
      // haría desaparecer la pantalla de mantenimiento ante el primer hipo de
      // red y dejaría al usuario creyendo que ya puede trabajar.
      return null
    } finally {
      setCargando(false)
    }
  }, [])

  // Reloj del servidor. Todo cálculo de tiempo restante en la app pasa por
  // aquí para no repetir la corrección de desfase en cada componente.
  const ahoraServidor = useCallback(() => Date.now() + desfaseRef.current, [])

  // Sondeo con intervalo recalculado en cada vuelta. Se usa setTimeout
  // encadenado y no setInterval justamente por eso: la cadencia cambia según
  // el estado, y un setInterval fijo obligaría a destruirlo y recrearlo en
  // cada transición.
  useEffect(() => {
    let cancelado = false
    let temporizador = null

    async function ciclo() {
      const nuevo = await consultar()
      if (cancelado) return
      temporizador = setTimeout(ciclo, intervaloDeSondeo(nuevo, Date.now() + desfaseRef.current))
    }
    ciclo()

    // Volver a la pestaña es el momento en que más probable es que el estado
    // haya cambiado sin que nos enteráramos (el navegador ralentiza o congela
    // los temporizadores de las pestañas en segundo plano).
    function alVolver() {
      if (document.visibilityState === 'visible') {
        clearTimeout(temporizador)
        ciclo()
      }
    }

    // Cualquier petición bloqueada por el backend dispara este evento (ver
    // api/client.js): es la vía por la que la pantalla de mantenimiento
    // aparece al instante en vez de esperar al próximo sondeo.
    function alDetectarMantenimiento(e) {
      if (e.detail) {
        if (e.detail.ahora) desfaseRef.current = new Date(e.detail.ahora).getTime() - Date.now()
        setEstado(e.detail)
      }
      clearTimeout(temporizador)
      ciclo()
    }

    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('skynet:mantenimiento', alDetectarMantenimiento)

    return () => {
      cancelado = true
      clearTimeout(temporizador)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('skynet:mantenimiento', alDetectarMantenimiento)
    }
  }, [consultar])

  const valor = {
    estado,
    cargando,
    ahoraServidor,
    refrescar: consultar,
    // Se sobrescribe desde la pantalla de administración tras cada acción,
    // para que el propio administrador vea el cambio sin esperar al sondeo.
    aplicarEstado: setEstado,
    enMantenimiento: estado?.status === 'en_mantenimiento',
    hayProgramado: estado?.status === 'programado',
  }

  return <PlataformaContext.Provider value={valor}>{children}</PlataformaContext.Provider>
}

export function usePlataforma() {
  const ctx = useContext(PlataformaContext)
  if (!ctx) throw new Error('usePlataforma debe usarse dentro de PlataformaProvider')
  return ctx
}

// ── Cuenta regresiva ────────────────────────────────────────────────────────
// Devuelve los milisegundos restantes hasta `objetivo` según el reloj del
// servidor, recalculados cada segundo. Devuelve null si no hay objetivo, y 0
// cuando ya venció (nunca negativos: ningún componente debería tener que
// acordarse de hacer Math.max).
export function useCuentaRegresiva(objetivo) {
  const { ahoraServidor } = usePlataforma()
  const destino = objetivo ? new Date(objetivo).getTime() : null

  const calcular = useCallback(
    () => (destino === null ? null : Math.max(0, destino - ahoraServidor())),
    [destino, ahoraServidor]
  )

  const [restante, setRestante] = useState(calcular)

  useEffect(() => {
    setRestante(calcular())
    if (destino === null) return
    const t = setInterval(() => setRestante(calcular()), 1000)
    return () => clearInterval(t)
  }, [calcular, destino])

  return restante
}

// "01:24:32" / "12:05" — omite las horas cuando no hacen falta para que el
// número que importa sea el más grande de la pantalla.
export function formatearRestante(ms) {
  if (ms === null || ms === undefined) return ''
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const dosDigitos = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${dosDigitos(h)}:${dosDigitos(m)}:${dosDigitos(s)}` : `${dosDigitos(m)}:${dosDigitos(s)}`
}

// Fecha larga en la zona del Terminal. Explícita a propósito: el navegador de
// un usuario puede estar configurado en otro huso (pasa con equipos
// reinstalados o con el navegador en inglés), y la hora del mantenimiento
// tiene que ser la misma para todo el mundo.
export function formatearFechaHora(valor) {
  if (!valor) return '—'
  return new Date(valor).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
