import { Globe } from 'lucide-react'

export const ETIQUETA_ESTADO = { publish: 'Publicada', draft: 'Borrador', future: 'Programada' }
// Valores de BADGE_COLORES (ui.jsx) que dan el color: verde / ámbar / azul.
export const COLOR_ESTADO = { publish: 'libre', draft: 'pendiente', future: 'programado' }

// "YYYY-MM-DDTHH:mm:ss" (hora del sitio, sin zona) -> valor de datetime-local.
export const aInputFechaHora = (valor) => (valor ? String(valor).replace(' ', 'T').slice(0, 16) : '')

// Texto plano de un fragmento HTML (para resúmenes en listados).
export function htmlATexto(html) {
  if (!html) return ''
  // DOMParser crea un documento inerte (no carga imágenes ni ejecuta
  // manejadores), a diferencia de asignar innerHTML a un elemento suelto.
  return (new DOMParser().parseFromString(html, 'text/html').body.textContent || '').trim()
}

export function EncabezadoSeccion({ icono: Icono = Globe, titulo, descripcion, children }) {
  return (
    <>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Icono className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{titulo}</h1>
        </div>
        {children}
      </div>
      {descripcion && <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">{descripcion}</p>}
    </>
  )
}
