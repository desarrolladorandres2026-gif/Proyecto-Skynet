import { Component } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { TriangleAlert, RotateCcw, House } from 'lucide-react'
import { Btn } from '../components/ui.jsx'

// Envuelve el contenido de cada ruta (el <Outlet/> de AppLayout y MobileShell).
//
// Sin esto, cualquier excepción durante el render deja la aplicación entera en
// blanco: React 19 desmonta todo el árbol cuando nadie captura el error, y sin
// barra lateral ni barra inferior no queda forma de navegar a otra parte —
// solo recargar a mano. Como el límite envuelve SOLO el contenido y no el
// shell, un error en una pantalla deja el resto de la aplicación utilizable.
//
// Va aquí y no en App.jsx a propósito: envolver <AppShell/> lo remontaría
// entero en cada navegación (ver la `key` de abajo), tirando el estado del
// sidebar y provocando parpadeo.

class LimiteDeError extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // El detalle solo va a la consola: el usuario ve un mensaje legible, no un
    // stack trace (que además puede filtrar rutas y nombres internos).
    console.error('Error no capturado al renderizar la pantalla:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return this.props.fallback(this.state.error)
  }
}

function PantallaDeError({ error, onReintentar }) {
  const navigate = useNavigate()

  return (
    <div className="mx-auto flex min-h-[60svh] max-w-md flex-col items-center justify-center gap-3 text-center">
      <TriangleAlert className="h-8 w-8 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <p className="text-lg font-medium text-slate-700 dark:text-slate-200">
        No se pudo mostrar esta pantalla
      </p>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Ocurrió un error inesperado al cargarla. El resto del sistema sigue funcionando: puedes
        volver al inicio o intentarlo de nuevo.
      </p>
      {/* El mensaje técnico ayuda a reportar el problema; se muestra apagado
          para que no compita con las acciones. */}
      {error?.message && (
        <p className="max-w-full break-words font-mono text-xs text-slate-400 dark:text-slate-500">
          {error.message}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Btn onClick={onReintentar} className="flex items-center gap-1.5">
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Reintentar
        </Btn>
        <Btn variante="secundario" onClick={() => navigate('/')} className="flex items-center gap-1.5">
          <House className="h-4 w-4" aria-hidden="true" /> Ir al inicio
        </Btn>
      </div>
    </div>
  )
}

export default function ContenidoRuta() {
  const { pathname } = useLocation()

  // `key={pathname}` remonta el límite en cada navegación, así que un error en
  // una pantalla no deja atrapado al usuario en la pantalla de error cuando se
  // va a otra ruta: el estado se descarta solo. "Reintentar" recarga porque un
  // error de render suele venir de datos ya en memoria; volver a montar el
  // mismo componente con el mismo estado fallaría igual.
  return (
    <LimiteDeError
      key={pathname}
      fallback={(error) => <PantallaDeError error={error} onReintentar={() => window.location.reload()} />}
    >
      <Outlet />
    </LimiteDeError>
  )
}
