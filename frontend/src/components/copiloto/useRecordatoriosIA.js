import { useEffect, useRef } from 'react'
import { ia as iaApi } from '../../api/ia.js'

// Recordatorios proactivos de lo pendiente ("tienes 3 requerimientos por
// aprobar"). Este hook solo PREGUNTA; quién decide si toca hablar es el
// servidor (ver Backend/src/modules/ia/ia.recordatorios.js): respeta la
// preferencia del usuario, el silencio cuando no hay nada pendiente y un
// máximo de uno cada 2 h por usuario aunque tenga varias pestañas abiertas.
//
// Por eso este intervalo es solo "con qué frecuencia vale la pena preguntar",
// no "con qué frecuencia se habla": 15 min deja el recordatorio a lo sumo 15
// min tarde sobre las 2 h, a cambio de una consulta barata (una lectura).
const INTERVALO_MS = 15 * 60_000

// Pausa tras montar: el widget se monta con la app, y hablar encima de la
// pantalla que todavía está cargando (o de las voces del navegador, que se
// cargan de forma asíncrona) hace que el primer recordatorio salga cortado.
const ESPERA_INICIAL_MS = 5_000

// `onRecordatorio` debe ser estable (useCallback): es dependencia del efecto,
// y si cambiara en cada render el temporizador se reiniciaría sin parar.
export function useRecordatoriosIA({ activo, onRecordatorio }) {
  const preguntandoRef = useRef(false)

  useEffect(() => {
    if (!activo) return
    let cancelado = false

    async function preguntar() {
      // Una pestaña en segundo plano no tiene a nadie escuchando: preguntar
      // ahí gastaría el turno del usuario en un recordatorio que nadie oye.
      if (document.visibilityState !== 'visible') return
      if (preguntandoRef.current) return
      preguntandoRef.current = true
      try {
        const { recordatorio } = await iaApi.recordatorio()
        if (!cancelado && recordatorio) onRecordatorio(recordatorio)
      } catch {
        // Fallo de red/servidor en una consulta de fondo: no hay nada útil
        // que decirle al usuario, la siguiente vuelta reintenta.
      } finally {
        preguntandoRef.current = false
      }
    }

    const inicio = setTimeout(preguntar, ESPERA_INICIAL_MS)
    const id = setInterval(preguntar, INTERVALO_MS)
    // Volver a la pestaña tras un rato es el momento natural para recordar.
    function alVolver() {
      if (document.visibilityState === 'visible') preguntar()
    }
    document.addEventListener('visibilitychange', alVolver)

    return () => {
      cancelado = true
      clearTimeout(inicio)
      clearInterval(id)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [activo, onRecordatorio])
}
