import { useCallback, useEffect, useState } from 'react'
import { CircleCheck, CircleX, TriangleAlert, RefreshCw, Loader2 } from 'lucide-react'

import { useAuth } from '../auth/AuthContext.jsx'
import { puenteEscritorio, esEscritorio } from './esEscritorio.js'
import { precargarModelo, estadoModelo } from './reconocedorVosk.js'

// Autodiagnóstico del asistente de escritorio.
//
// Existe porque el asistente falla de formas MUDAS: la ventana que escucha
// está oculta, así que cuando algo no funciona no hay ningún sitio donde
// aparezca el error. Sin esta pantalla, "Skynet no me responde" puede ser el
// micrófono bloqueado por Windows, el modelo sin instalar, la sesión caducada,
// el atajo pisado por otro programa o el backend caído — cinco causas con
// cinco arreglos distintos e indistinguibles desde fuera.
//
// Cada comprobación dice QUÉ falla y DÓNDE se arregla. Un diagnóstico que solo
// dice "error" no ahorra ni una llamada a soporte.

const ESTADO = { OK: 'ok', AVISO: 'aviso', FALLO: 'fallo', PROBANDO: 'probando' }

function Fila({ nombre, estado, detalle, arreglo }) {
  const Icono =
    estado === ESTADO.OK
      ? CircleCheck
      : estado === ESTADO.AVISO
        ? TriangleAlert
        : estado === ESTADO.PROBANDO
          ? Loader2
          : CircleX
  const color =
    estado === ESTADO.OK
      ? 'text-emerald-500'
      : estado === ESTADO.AVISO
        ? 'text-amber-500'
        : estado === ESTADO.PROBANDO
          ? 'text-slate-400'
          : 'text-red-500'

  return (
    <li className="flex items-start gap-3 border-b border-slate-200 py-3 dark:border-slate-800">
      <Icono
        className={`mt-0.5 h-5 w-5 shrink-0 ${color} ${estado === ESTADO.PROBANDO ? 'animate-spin' : ''}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{nombre}</p>
        {detalle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detalle}</p>}
        {arreglo && estado !== ESTADO.OK && (
          <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="font-semibold">Cómo se arregla: </span>
            {arreglo}
          </p>
        )}
      </div>
    </li>
  )
}

// Traduce el estado del actualizador (src/actualizador.js del proceso Electron)
// a lenguaje de esta pantalla. Ninguna de estas situaciones es un FALLO rojo:
// un Skynet desactualizado sigue funcionando, así que marcarlo en rojo restaría
// urgencia a las filas que sí significan "el asistente no puede trabajar".
function describirActualizaciones(act) {
  if (!act) {
    return {
      estado: ESTADO.AVISO,
      detalle: 'Solo disponible en la app de escritorio instalada.',
      arreglo: 'Abre Skynet desde el icono de la bandeja, no desde el navegador.',
    }
  }
  if (act.fase === 'lista') {
    return {
      estado: ESTADO.AVISO,
      detalle: `La versión ${act.version} está descargada y esperando (tienes la ${act.versionInstalada}).`,
      arreglo:
        'Menú de la bandeja → "Reiniciar para actualizar". Si no lo haces, se instalará sola la próxima vez que cierres Skynet.',
    }
  }
  if (act.fase === 'descargando') {
    return { estado: ESTADO.PROBANDO, detalle: `Descargando la versión ${act.version}... ${act.detalle || ''}` }
  }
  if (act.fase === 'desactivado') {
    return {
      estado: ESTADO.AVISO,
      detalle: `${act.detalle}. Este equipo no recibirá correcciones automáticamente.`,
      arreglo: 'Quita "actualizaciones": false del config.json junto al ejecutable y reinicia Skynet.',
    }
  }
  if (act.fase === 'error') {
    return {
      estado: ESTADO.AVISO,
      detalle: `No se pudo consultar el servidor de actualizaciones: ${act.detalle}`,
      arreglo:
        'Suele ser falta de internet en el equipo. Si el resto de Skynet funciona, comprueba que /descargas/latest.yml esté publicado en el servidor.',
    }
  }
  return { estado: ESTADO.OK, detalle: `Versión ${act.versionInstalada}, al día. Se revisa cada 6 horas.` }
}

export default function DiagnosticoPage() {
  const { usuario, cargando } = useAuth()
  const puente = puenteEscritorio()

  const [info, setInfo] = useState(null)
  const [microfono, setMicrofono] = useState({ estado: ESTADO.PROBANDO })
  const [modelo, setModelo] = useState({ estado: ESTADO.PROBANDO })
  const [voz, setVoz] = useState({ estado: ESTADO.PROBANDO })
  const [backend, setBackend] = useState({ estado: ESTADO.PROBANDO })
  const [ejecutando, setEjecutando] = useState(false)

  const revisar = useCallback(async () => {
    setEjecutando(true)
    setMicrofono({ estado: ESTADO.PROBANDO })
    setModelo({ estado: ESTADO.PROBANDO })
    setVoz({ estado: ESTADO.PROBANDO })
    setBackend({ estado: ESTADO.PROBANDO })

    setInfo(await puente.diagnostico())

    // ── Micrófono ────────────────────────────────────────────────────────────
    // Se enumeran los dispositivos ANTES de pedir permiso: distingue "este
    // equipo no tiene micrófono" (o Windows se lo oculta a las apps) de "hay
    // micrófono pero el permiso está denegado", que son dos problemas con dos
    // arreglos completamente distintos.
    try {
      const dispositivos = await navigator.mediaDevices.enumerateDevices()
      const entradas = dispositivos.filter((d) => d.kind === 'audioinput')
      if (!entradas.length) {
        setMicrofono({
          estado: ESTADO.FALLO,
          detalle: 'Windows no expone ningún micrófono a las aplicaciones.',
          arreglo:
            'Configuración de Windows → Privacidad y seguridad → Micrófono: activa "Acceso al micrófono" y "Permitir que las aplicaciones de escritorio accedan al micrófono". Si el equipo no tiene micrófono, conecta uno.',
        })
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        for (const p of stream.getTracks()) p.stop()
        setMicrofono({
          estado: ESTADO.OK,
          detalle: `${entradas.length} dispositivo(s) de entrada disponibles.`,
        })
      }
    } catch (err) {
      setMicrofono({
        estado: ESTADO.FALLO,
        detalle: `El sistema rechazó el acceso (${err.name}).`,
        arreglo:
          'Configuración de Windows → Privacidad y seguridad → Micrófono y permite el acceso a las aplicaciones de escritorio. Después reinicia Skynet.',
      })
    }

    // ── Motor de voz ─────────────────────────────────────────────────────────
    if (!esEscritorio()) {
      setModelo({
        estado: ESTADO.AVISO,
        detalle: 'Estás en el navegador: aquí se usa la Web Speech API, no Vosk.',
      })
    } else if (!puente.hayModelo) {
      setModelo({
        estado: ESTADO.FALLO,
        detalle: 'El modelo de reconocimiento no está instalado.',
        arreglo: 'En la carpeta escritorio/ del proyecto ejecuta: npm run modelo',
      })
    } else {
      const ok = await precargarModelo()
      const est = estadoModelo()
      setModelo(
        ok
          ? { estado: ESTADO.OK, detalle: 'Modelo de español cargado. El reconocimiento es offline.' }
          : {
              estado: ESTADO.FALLO,
              detalle: est.error || 'El modelo existe pero no se pudo cargar.',
              arreglo: 'Borra recursos/modelo-voz-es.tar.gz y vuelve a ejecutar: npm run modelo',
            }
      )
    }

    // ── Voces de lectura (TTS) ───────────────────────────────────────────────
    // Se sondea igual que useHablar.js: dentro de Electron las voces aparecen
    // 1-2 s después de cargar y `voiceschanged` no llega a dispararse.
    let voces = []
    for (let i = 0; i < 12 && !voces.length; i++) {
      voces = window.speechSynthesis?.getVoices?.() || []
      if (!voces.length) await new Promise((r) => setTimeout(r, 250))
    }
    const enEspanol = voces.filter((v) => /^es/i.test(v.lang))
    setVoz(
      !enEspanol.length
        ? {
            estado: ESTADO.FALLO,
            detalle: `Windows no tiene ninguna voz en español instalada (${voces.length} voces en total).`,
            arreglo:
              'Configuración de Windows → Hora e idioma → Voz → Administrar voces → Agregar voces, y elige español.',
          }
        : {
            estado: ESTADO.OK,
            detalle: `${enEspanol.length} voz(ces) en español: ${enEspanol.map((v) => v.name).join(', ')}.`,
            // Aviso, no fallo: dos voces bastan para usar el asistente. Se
            // explica porque en el navegador se ven MÁS (Chrome añade voces de
            // Google que van por red y traen sus propias claves), y sin esta
            // nota parece que la app de escritorio perdió voces.
            arreglo:
              'Si quieres más, añádelas en Configuración de Windows → Hora e idioma → Voz. En el navegador aparecen más porque Chrome suma voces de Google que funcionan por internet; el asistente solo usa las instaladas en el equipo.',
          }
    )

    // ── Backend ──────────────────────────────────────────────────────────────
    // Se pega a /health, que no exige sesión: así se separa "el servidor no
    // responde" de "el servidor responde pero no estoy autenticado".
    try {
      const res = await fetch('/health', { cache: 'no-store' })
      setBackend(
        res.ok
          ? { estado: ESTADO.OK, detalle: 'El servidor de Skynet responde.' }
          : {
              estado: ESTADO.FALLO,
              detalle: `El servidor respondió ${res.status}.`,
              arreglo: 'Revisa que el backend esté levantado y que la URL del config sea correcta.',
            }
      )
    } catch {
      setBackend({
        estado: ESTADO.FALLO,
        detalle: 'No se pudo contactar al servidor.',
        arreglo: `Comprueba que el backend esté corriendo y que "url" apunte al servidor correcto en ${info?.rutaConfig || 'config.json'}.`,
      })
    }

    setEjecutando(false)
    // `info` solo se usa para redactar un mensaje; incluirlo en las
    // dependencias reejecutaría el diagnóstico cada vez que él mismo lo
    // actualiza, en bucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puente])

  useEffect(() => {
    revisar()
  }, [revisar])

  const sesion = cargando
    ? { estado: ESTADO.PROBANDO }
    : usuario
      ? { estado: ESTADO.OK, detalle: `Sesión activa: ${usuario.nombre_usuario}.` }
      : {
          estado: ESTADO.FALLO,
          detalle: 'No hay sesión iniciada.',
          arreglo:
            'Abre el panel desde el menú de la bandeja e inicia sesión. La sesión dura 8 horas; después hay que repetirlo.',
        }

  const actualizaciones = describirActualizaciones(info?.actualizaciones)

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
            Diagnóstico del asistente
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Comprueba lo que hace falta para que Skynet escuche en segundo plano.
          </p>
        </div>
        <button
          type="button"
          onClick={revisar}
          disabled={ejecutando}
          className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-cyan-700 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${ejecutando ? 'animate-spin' : ''}`} aria-hidden="true" />
          Revisar
        </button>
      </div>

      <ul className="mb-6">
        <Fila
          nombre="Modo escritorio"
          estado={esEscritorio() ? ESTADO.OK : ESTADO.AVISO}
          detalle={
            esEscritorio()
              ? `Corriendo dentro del asistente (Electron ${info?.electron || '—'}).`
              : 'Estás viendo esta página en el navegador. El asistente global solo funciona desde la app de escritorio.'
          }
          arreglo="Abre Skynet desde el icono de la bandeja del sistema, no desde el navegador."
        />
        <Fila nombre="Micrófono" {...microfono} />
        <Fila nombre="Motor de reconocimiento" {...modelo} />
        <Fila nombre="Voces de lectura" {...voz} />
        <Fila nombre="Servidor de Skynet" {...backend} />
        <Fila nombre="Sesión" {...sesion} />
        <Fila
          nombre="Atajo global"
          estado={!esEscritorio() ? ESTADO.AVISO : info?.atajoRegistrado ? ESTADO.OK : ESTADO.FALLO}
          detalle={
            info?.atajoRegistrado
              ? `${info.atajo} funciona desde cualquier ventana.`
              : `No se pudo registrar ${info?.atajo || 'el atajo'}.`
          }
          arreglo={`Otro programa ya usa esa combinación. Cámbiala en ${info?.rutaConfig || 'config.json'} y reinicia Skynet.`}
        />
        <Fila
          nombre='Escucha "Oye Skynet"'
          estado={info?.wakeWord ? ESTADO.OK : ESTADO.AVISO}
          detalle={
            info?.wakeWord
              ? 'Encendida: el micrófono queda abierto buscando la frase de activación.'
              : 'Apagada. Solo responde al atajo global.'
          }
          arreglo='Actívala en el menú de la bandeja → "Escuchar Oye Skynet". Para dejarla fija, pon "wakeWord": true en el config.'
        />
        <Fila
          nombre="Arranque con Windows"
          estado={info?.autoArranque ? ESTADO.OK : ESTADO.AVISO}
          detalle={
            info?.autoArranque
              ? 'Skynet se inicia solo al encender el equipo.'
              : 'Hay que abrir Skynet a mano después de cada reinicio.'
          }
          arreglo='Actívalo en el menú de la bandeja → "Arrancar con Windows".'
        />
        <Fila nombre="Actualizaciones" {...actualizaciones} />
      </ul>

      {info && (
        <details className="rounded-xl border border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <summary className="cursor-pointer font-semibold">Datos técnicos</summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono">
            <dt>versión</dt>
            <dd>{info.version}</dd>
            <dt>chrome</dt>
            <dd>{info.chrome}</dd>
            <dt>url</dt>
            <dd className="break-all">{info.url}</dd>
            <dt>config</dt>
            <dd className="break-all">{info.rutaConfig}</dd>
            <dt>modelo</dt>
            <dd className="break-all">{info.rutaModelo}</dd>
          </dl>
        </details>
      )}
    </div>
  )
}
