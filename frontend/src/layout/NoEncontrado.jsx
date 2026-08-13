import { useLocation, useNavigate } from 'react-router-dom'
import { Compass, ArrowLeft, House } from 'lucide-react'
import { Btn } from '../components/ui.jsx'

// Ruta comodín. Sin ella, una URL desconocida hacía que <Routes> renderizara
// null: pantalla completamente vacía, sin barra lateral ni forma de volver
// salvo editar la dirección a mano. Los casos reales que llegan aquí no son
// hipotéticos — un enlace de notificación push hacia un requerimiento que ya
// se eliminó por rango de fechas, un marcador viejo de antes de un cambio de
// rutas, o un módulo al que se llega escribiendo la URL.
//
// Va DENTRO del layout protegido (ver App.jsx), así que conserva el sidebar y
// la barra inferior: el usuario puede seguir navegando sin recargar. Si no hay
// sesión, ProtectedRoute lo manda al login antes de llegar hasta aquí.
export default function NoEncontrado() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex min-h-[60svh] max-w-md flex-col items-center justify-center gap-3 text-center">
      <Compass className="h-8 w-8 text-slate-400 dark:text-slate-500" aria-hidden="true" />
      <p className="text-lg font-medium text-slate-700 dark:text-slate-200">Esta página no existe</p>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        La dirección no corresponde a ninguna sección del sistema. Puede que el enlace esté
        desactualizado o que el registro al que apuntaba se haya eliminado.
      </p>
      <p className="max-w-full break-all font-mono text-xs text-slate-400 dark:text-slate-500">
        {pathname}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Btn onClick={() => navigate('/')} className="flex items-center gap-1.5">
          <House className="h-4 w-4" aria-hidden="true" /> Ir al inicio
        </Btn>
        {/* -1 en vez de navigate(-1) a secas para dejar claro que es "atrás"
            en el historial del navegador, no una ruta. */}
        <Btn variante="secundario" onClick={() => navigate(-1)} className="flex items-center gap-1.5">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver atrás
        </Btn>
      </div>
    </div>
  )
}
