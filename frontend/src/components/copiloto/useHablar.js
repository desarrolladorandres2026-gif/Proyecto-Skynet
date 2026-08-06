import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Lee en voz alta la respuesta de Skynet CONFORME VA LLEGANDO del stream, no
// al final: apenas se cierra una oración completa se manda a hablar, mientras
// el modelo sigue generando el resto. Sin esto habría que esperar la respuesta
// entera (~2 s) antes de oír la primera palabra, y se perdería la sensación de
// inmediatez que da el streaming.
//
// Es primo de modules/induccion/useNarracionVoz.js (misma Web Speech API) pero
// resuelve un problema distinto: aquel narra una lista de textos ya conocida
// de antemano; este recibe un chorro de trozos sueltos y tiene que decidir
// dónde termina cada oración. También permite ELEGIR la voz entre las que
// tenga instaladas el sistema — cuáles suenan mejor depende del equipo de cada
// persona, así que no hay una única voz "correcta" que fijar en el código.

// Corta en el signo de puntuación final, incluidos los de cierre del español.
// El salto de línea también cierra oración: el modelo suele usar viñetas.
const FIN_DE_ORACION = /([.!?…:;\n]+)\s*/g

// El modelo suele responder con listas del tipo "- **Etiqueta:** valor" — los
// dos puntos que cierran "Etiqueta" quedan DENTRO de la negrita, antes de su
// "**" de cierre. Cortar ahí (como hacía la versión anterior) le pasaba a
// limpiarParaVoz un fragmento con un "**" suelto sin pareja, que su regex
// balanceada no puede quitar, y el sintetizador terminaba leyendo "asterisco
// asterisco" en voz alta. La cuenta de "**" debe ser PAR en todo lo hablado
// hasta ese punto: si es impar, se está a mitad de una negrita y hay que
// esperar el siguiente punto de corte (normalmente el salto de línea que
// cierra la viñeta) en vez de cortar ahí.
function contarAsteriscosDobles(texto) {
  return (texto.match(/\*\*/g) || []).length
}

function buscarCorteSeguro(texto) {
  FIN_DE_ORACION.lastIndex = 0
  let match
  while ((match = FIN_DE_ORACION.exec(texto))) {
    const hasta = match.index + match[0].length
    if (contarAsteriscosDobles(texto.slice(0, hasta)) % 2 === 0) return hasta
  }
  return -1
}

// Corte de emergencia para EMPEZAR A HABLAR ANTES.
//
// El corte normal espera un punto. Cuando la respuesta abre con una frase
// larga ("Tienes tres requerimientos pendientes de aprobación de Financiero y
// dos en Bodega desde el martes, además de…"), esperar el punto son varios
// cientos de milisegundos de silencio con el texto ya en pantalla: se ve
// escribiéndose pero no se oye nada, que es exactamente la sensación de
// lentitud que se quiere eliminar.
//
// A partir de cierta longitud se acepta cortar en una coma, que en español es
// una pausa prosódica legítima: la frase suena natural igual. Solo se aplica
// mientras no se haya dicho nada todavía; una vez el sintetizador arrancó, la
// cola ya lo mantiene ocupado y cortar fino no aporta.
const LONGITUD_PARA_CORTE_TEMPRANO = 70
const PAUSA_INTERMEDIA = /([,—])\s+/g

function buscarCorteTemprano(texto) {
  if (texto.length < LONGITUD_PARA_CORTE_TEMPRANO) return -1
  PAUSA_INTERMEDIA.lastIndex = 0
  let match
  let ultimo = -1
  while ((match = PAUSA_INTERMEDIA.exec(texto))) {
    const hasta = match.index + match[0].length
    // Mismo cuidado que el corte normal: no partir una negrita a la mitad, o
    // se lee "asterisco asterisco" en voz alta.
    if (contarAsteriscosDobles(texto.slice(0, hasta)) % 2 === 0) ultimo = hasta
  }
  return ultimo
}

// El modelo responde en Markdown (**negrita**, listas con - o *). Sin limpiar,
// el sintetizador lee "asterisco asterisco siete asterisco asterisco".
// Exportada para poder probarla sin navegador.
export function limpiarParaVoz(texto) {
  return texto
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/_{2,}/g, '')
    .trim()
}

const CLAVE_VOZ_PREFERIDA = 'skynet_voz_preferida'
const CLAVE_MODO_RESPUESTA = 'skynet_modo_respuesta'

// Cómo quiere la persona recibir las respuestas. El texto SIEMPRE aparece en
// el chat (es un chat); lo que cambia es cuándo además se lee en voz alta:
//  - 'auto':  solo si preguntó por voz (micrófono u "Oye Skynet").
//  - 'voz':   siempre, aunque haya escrito la pregunta.
//  - 'texto': nunca.
export const MODOS_RESPUESTA = ['auto', 'voz', 'texto']

// Todas las que el sistema pueda leer en español, con las variantes latinas
// primero (más naturales para el público del Terminal que las de España).
function vocesEnEspanol(voces) {
  return voces
    .filter((v) => /^es/i.test(v.lang))
    .sort((a, b) => {
      const esLatam = (v) => !/es-es/i.test(v.lang)
      if (esLatam(a) !== esLatam(b)) return esLatam(a) ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

function elegirVozPorDefecto(voces) {
  return (
    voces.find((v) => /es-CO/i.test(v.lang)) ||
    voces.find((v) => /^es/i.test(v.lang)) ||
    voces[0] ||
    null
  )
}

// getVoices() suele venir vacío en la primera llamada (el navegador carga las
// voces de forma asíncrona) — sin esperar, la primera respuesta se leería con
// la voz por defecto en inglés.
function cargarVoces() {
  return new Promise((resolve) => {
    if (window.speechSynthesis.getVoices().length > 0) return resolve()
    const onVoces = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoces)
      resolve()
    }
    window.speechSynthesis.addEventListener('voiceschanged', onVoces)
    setTimeout(resolve, 1000)
  })
}

export function useHablar() {
  const [hablando, setHablando] = useState(false)
  const [vocesDisponibles, setVocesDisponibles] = useState([])
  const [vozElegidaURI, setVozElegidaURI] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_VOZ_PREFERIDA) || ''
    } catch {
      return '' // localStorage puede fallar en navegación privada
    }
  })
  const [modoRespuesta, setModoRespuesta] = useState(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_MODO_RESPUESTA)
      // Se valida contra la lista: un valor viejo o manipulado a mano en
      // localStorage no debe dejar el chat en un estado que no existe.
      return MODOS_RESPUESTA.includes(guardado) ? guardado : 'auto'
    } catch {
      return 'auto'
    }
  })

  const pendienteRef = useRef('') // texto recibido que aún no forma una oración
  // Si ya salió algo por el altavoz en ESTA respuesta. Solo lo usa el corte
  // temprano por coma, que únicamente tiene sentido antes de la primera
  // palabra (ver buscarCorteTemprano).
  const yaHabloRef = useRef(false)
  const cancelarRef = useRef(false)
  const vocesListasRef = useRef(false)
  // Espejo por ref: `decir()` es un useCallback con deps [] (no debe
  // recrearse en cada respuesta) pero necesita leer la voz VIGENTE al momento
  // de hablar, no la que había cuando se creó el callback.
  const vozElegidaRef = useRef(null)

  const soportado = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    // Reponer la bandera en el MONTAJE es imprescindible, no redundante: en
    // desarrollo React corre los efectos dos veces (StrictMode monta, limpia y
    // vuelve a montar). Sin esta línea, la limpieza del primer ciclo dejaba
    // `cancelarRef.current` en true de forma permanente y decir() salía por su
    // guarda temprana SIEMPRE — por eso el botón "escuchar" del selector no
    // sonaba nunca, mientras que la lectura de las respuestas sí funcionaba
    // (esa pasa antes por reiniciar(), que ya reponía la bandera).
    cancelarRef.current = false
    return () => {
      cancelarRef.current = true
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
    }
  }, [])

  // Puebla la lista de voces disponibles apenas el navegador las tenga listas,
  // para que el selector de voz no aparezca vacío al abrir el chat.
  useEffect(() => {
    if (!soportado) return
    let cancelado = false
    cargarVoces().then(() => {
      if (cancelado) return
      const todas = window.speechSynthesis.getVoices()
      setVocesDisponibles(vocesEnEspanol(todas))
      vocesListasRef.current = true
    })
    return () => {
      cancelado = true
    }
  }, [soportado])

  // Resuelve CUÁL objeto SpeechSynthesisVoice usar: la elegida por el usuario
  // si sigue instalada, o si no hay ninguna guardada (o ya no existe, p. ej.
  // cambió de equipo) cae al criterio por defecto.
  //
  // Se calcula DURANTE el render y no dentro de un efecto: guardar el
  // resultado únicamente en una ref no dispara un nuevo render, así que el
  // selector seguía marcando la voz anterior hasta que cualquier otra cosa
  // provocara un re-render — eso era el "retraso" al cambiar de voz.
  const vozActual = useMemo(() => {
    if (!vocesDisponibles.length) return null
    const elegida = vozElegidaURI && vocesDisponibles.find((v) => v.voiceURI === vozElegidaURI)
    return elegida || elegirVozPorDefecto(vocesDisponibles)
  }, [vocesDisponibles, vozElegidaURI])

  // A qué modo volver cuando se reactiva la voz desde el interruptor rápido.
  // Se inicializa con el modo guardado si ya venía con voz; si venía silenciado,
  // 'auto' es el punto de partida razonable.
  const modoConVozPrevioRef = useRef(modoRespuesta === 'texto' ? 'auto' : modoRespuesta)

  // Espejo en ref para decir(), que es un useCallback estable (deps []) y debe
  // leer la voz vigente al momento de hablar, no la que había cuando se creó.
  useEffect(() => {
    vozElegidaRef.current = vozActual
  }, [vozActual])

  const elegirModoRespuesta = useCallback((modo) => {
    if (!MODOS_RESPUESTA.includes(modo)) return
    // Recuerda el último modo con voz para poder volver a ÉL al reactivar
    // (ver alternarVoz): si alguien eligió "siempre habladas" y luego silencia,
    // al reactivar espera recuperar "siempre", no caer en "automático".
    if (modo !== 'texto') modoConVozPrevioRef.current = modo
    setModoRespuesta(modo)
    try {
      localStorage.setItem(CLAVE_MODO_RESPUESTA, modo)
    } catch {
      /* navegación privada: la preferencia dura solo esta sesión */
    }
  }, [])

  // Interruptor de un clic para el encabezado del chat: silencia o reactiva la
  // voz sin abrir el panel de preferencias. El panel sigue existiendo para
  // elegir ENTRE los modos con voz ('auto' vs 'voz'); esto es solo el
  // encendido/apagado, que es lo que se necesita a diario.
  const alternarVoz = useCallback(() => {
    elegirModoRespuesta(modoRespuesta === 'texto' ? modoConVozPrevioRef.current : 'texto')
  }, [elegirModoRespuesta, modoRespuesta])

  // Única fuente de la decisión "¿esta respuesta se lee en voz alta?".
  // El widget la consulta en vez de asumir que preguntar por voz implica
  // responder por voz, que era la regla fija anterior.
  const debeHablar = useCallback(
    (preguntadoPorVoz) => {
      if (!soportado || modoRespuesta === 'texto') return false
      if (modoRespuesta === 'voz') return true
      return Boolean(preguntadoPorVoz) // 'auto'
    },
    [modoRespuesta, soportado]
  )

  const elegirVoz = useCallback((voiceURI) => {
    setVozElegidaURI(voiceURI)
    try {
      localStorage.setItem(CLAVE_VOZ_PREFERIDA, voiceURI)
    } catch {
      /* navegación privada u otro bloqueo de localStorage: la elección solo
         dura la sesión actual, no es motivo para romper el flujo */
    }
  }, [])

  const decir = useCallback((frase, vozForzada) => {
    const limpio = limpiarParaVoz(frase)
    if (!limpio || cancelarRef.current) return
    const mensaje = new SpeechSynthesisUtterance(limpio)
    const voz = vozForzada || vozElegidaRef.current
    if (voz) {
      mensaje.voice = voz
      mensaje.lang = voz.lang
    }
    mensaje.rate = 1.05 // un pelo más rápido que la narración de inducción
    mensaje.onstart = () => setHablando(true)
    // `speechSynthesis.speaking` sigue en true mientras queden frases en cola;
    // solo se baja la bandera cuando de verdad se vació.
    const alTerminar = () => {
      if (!window.speechSynthesis.pending && !window.speechSynthesis.speaking) setHablando(false)
    }
    mensaje.onend = alTerminar
    mensaje.onerror = alTerminar
    window.speechSynthesis.speak(mensaje)
  }, [])

  // Arranca el motor de síntesis sin que se oiga nada.
  //
  // La primera llamada real a speak() en Chrome tarda bastante más que las
  // siguientes: hay que resolver la lista de voces, levantar el motor del
  // sistema y abrir la salida de audio. Si eso ocurre cuando ya llegó el
  // primer trozo de la respuesta, se suma entero al tiempo hasta la primera
  // palabra — justo el número que se intenta bajar.
  //
  // Se llama desde el gesto del usuario (pulsar el micrófono, encender "Oye
  // Skynet"), que además es cuando los navegadores permiten iniciar audio, así
  // que para cuando haya algo que decir el motor ya está caliente.
  //
  // El texto es un espacio y no una cadena vacía: con '' varios navegadores
  // descartan la locución sin llegar a inicializar nada, que es precisamente
  // lo que se busca provocar. `volume = 0` garantiza que no se oiga.
  const precalentarRef = useRef(false)
  const precalentar = useCallback(() => {
    if (!soportado || precalentarRef.current) return
    precalentarRef.current = true
    try {
      const mudo = new SpeechSynthesisUtterance(' ')
      mudo.volume = 0
      window.speechSynthesis.speak(mudo)
    } catch {
      /* si el navegador lo rechaza, se paga la demora en la primera respuesta */
    }
  }, [soportado])

  // Deja oír una voz específica sin afectar la que está elegida ni la cola en
  // curso — para el botón "probar" del selector, antes de decidirse por ella.
  const probarVoz = useCallback(
    (voiceURI) => {
      if (!soportado) return
      const voz = vocesDisponibles.find((v) => v.voiceURI === voiceURI)
      window.speechSynthesis.cancel()
      // Respiro mínimo entre cancel() y speak(): en Chrome, un speak() lanzado
      // en el mismo tick que el cancel() anterior puede perderse (cancel() es
      // asíncrono por dentro). Al leer una respuesta normal no ocurre, porque
      // entre reiniciar() y el primer trozo del stream siempre media la
      // latencia de red.
      setTimeout(() => decir('Hola, soy Skynet. Así sueno con esta voz.', voz), 60)
    },
    [decir, soportado, vocesDisponibles]
  )

  // Recibe cada trozo del stream y habla solo las oraciones ya cerradas; lo
  // que quede a medias se guarda para el siguiente trozo.
  const encolarTexto = useCallback(
    async (trozo) => {
      if (!soportado || cancelarRef.current) return
      if (!vocesListasRef.current) await cargarVoces()
      pendienteRef.current += trozo

      let hasta = buscarCorteSeguro(pendienteRef.current)
      while (hasta !== -1) {
        decir(pendienteRef.current.slice(0, hasta))
        yaHabloRef.current = true
        pendienteRef.current = pendienteRef.current.slice(hasta)
        hasta = buscarCorteSeguro(pendienteRef.current)
      }

      // Nada cerró oración todavía. Si aún no ha salido ni una palabra y ya se
      // acumuló una frase larga, se corta en una coma para empezar a hablar
      // (ver buscarCorteTemprano).
      if (!yaHabloRef.current) {
        const temprano = buscarCorteTemprano(pendienteRef.current)
        if (temprano !== -1) {
          decir(pendienteRef.current.slice(0, temprano))
          yaHabloRef.current = true
          pendienteRef.current = pendienteRef.current.slice(temprano)
        }
      }
    },
    [decir, soportado]
  )

  // Al cerrar el stream: habla el resto que no alcanzó a cerrar oración.
  const finalizar = useCallback(() => {
    if (!soportado) return
    const resto = pendienteRef.current
    pendienteRef.current = ''
    if (resto.trim()) decir(resto)
  }, [decir, soportado])

  const detener = useCallback(() => {
    pendienteRef.current = ''
    yaHabloRef.current = false
    if (soportado) window.speechSynthesis.cancel()
    setHablando(false)
  }, [soportado])

  // Se llama antes de cada respuesta nueva: limpia la cola de la anterior.
  const reiniciar = useCallback(() => {
    cancelarRef.current = false
    pendienteRef.current = ''
    // Cada respuesta vuelve a tener derecho a su corte temprano por coma.
    yaHabloRef.current = false
    if (soportado) window.speechSynthesis.cancel()
  }, [soportado])

  return {
    hablando,
    encolarTexto,
    finalizar,
    detener,
    reiniciar,
    soportado,
    vocesDisponibles,
    // Derivado del render (vozActual), NO de la ref: la ref va un render por
    // detrás y hacía que la marca de selección tardara en moverse.
    vozElegidaURI: vozActual?.voiceURI || '',
    modoRespuesta,
    elegirModoRespuesta,
    alternarVoz,
    vozActiva: modoRespuesta !== 'texto',
    debeHablar,
    elegirVoz,
    probarVoz,
    precalentar,
  }
}
