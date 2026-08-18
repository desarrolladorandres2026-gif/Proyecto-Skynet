import { useEffect, useState } from 'react'

const CLAVE_STORAGE = 'skynet_cookies_consentimiento'
const VERSION_POLITICA = '1'

function leerConsentimiento() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_STORAGE) || 'null')
    if (guardado?.version === VERSION_POLITICA && guardado?.aceptado === true) return guardado
  } catch {
    // localStorage corrupto o inaccesible: se pide consentimiento de nuevo
  }
  return null
}

export default function CookieConsent() {
  const [aceptado, setAceptado] = useState(() => leerConsentimiento() !== null)
  const [rechazado, setRechazado] = useState(false)

  useEffect(() => {
    if (rechazado) document.title = 'Skynet — acceso cancelado'
  }, [rechazado])

  if (aceptado) return null

  const aceptar = () => {
    localStorage.setItem(
      CLAVE_STORAGE,
      JSON.stringify({ aceptado: true, version: VERSION_POLITICA, fecha: new Date().toISOString() })
    )
    setAceptado(true)
  }

  const rechazar = () => {
    localStorage.removeItem(CLAVE_STORAGE)
    setRechazado(true)
  }

  if (rechazado) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950 p-4">
        <div className="max-w-sm text-center">
          <p className="text-lg font-semibold text-white">Acceso cancelado</p>
          <p className="mt-2 text-sm text-slate-400">
            Skynet necesita el uso de cookies para funcionar (sesión, preferencias y seguridad).
            Puedes cerrar esta pestaña o volver a intentarlo si cambias de opinión.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
        <p className="text-base font-semibold text-slate-900 dark:text-white">Uso de cookies</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Skynet usa cookies y almacenamiento local estrictamente necesarios para mantener tu sesión
          iniciada, recordar tus preferencias y proteger el sistema. Sin aceptarlas no es posible
          usar la plataforma.
        </p>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={rechazar}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            Rechazar y salir
          </button>
          <button
            onClick={aceptar}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
          >
            Aceptar y continuar
          </button>
        </div>
      </div>
    </div>
  )
}
