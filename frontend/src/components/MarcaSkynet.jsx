import claroLogo from '../assets/claro.png'

/**
 * Lockup de marca institucional: wordmark SKYNET + sello del Terminal de
 * Transportes de Neiva. Un solo componente para las tres cabeceras de shell
 * (sidebar desktop expandido, sidebar colapsado, header móvil) para que la
 * identidad se pinte igual en todas y se cambie en un solo lugar.
 *
 * - `variante="completa"`: sello + SKYNET + bajada "Terminal de Transportes
 *   de Neiva". Para barras anchas.
 * - `variante="compacta"`: sello + SKYNET, sin bajada. Para el header móvil.
 * - `variante="minima"`: solo el monograma de vía. Para el sidebar colapsado.
 *
 * El glifo retoma el logo de "El Terminal · Neiva": tres barras redondeadas
 * en diagonal ascendente (azul, verde, naranja) — movimiento hacia el
 * destino. Iconografía propia de la entidad, no genérica de tecnología.
 */
export function MarcaSkynet({ variante = 'completa', className = '' }) {
  const glifo = (
    <svg viewBox="0 0 32 32" className="h-6 w-6 shrink-0" aria-hidden="true">
      <g strokeLinecap="round" strokeWidth="5" fill="none">
        <path d="M6 24 L12 18" className="stroke-brand-600 dark:stroke-brand-400" />
        <path d="M13 21 L20 14" className="stroke-accent-600 dark:stroke-accent-400" />
        <path d="M21 17 L27 11" className="stroke-warn-500 dark:stroke-warn-400" />
      </g>
    </svg>
  )

  if (variante === 'minima') {
    return <span className={className}>{glifo}</span>
  }

  return (
    <div className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <img
        src={claroLogo}
        alt="Terminal de Transportes de Neiva"
        className="h-7 w-7 shrink-0 rounded-md object-contain"
      />
      <span className="h-6 w-px shrink-0 bg-slate-900/10 dark:bg-white/15" aria-hidden="true" />
      <span className="flex min-w-0 flex-col leading-none">
        <span className="font-display text-sm font-bold tracking-[0.22em] text-brand-800 dark:text-white">
          TTN
        </span>
        {variante === 'completa' && (
          <span className="panel-mono mt-1 truncate text-[9px] font-medium tracking-[0.14em] text-slate-500 uppercase dark:text-brand-200/70">
            Terminal de Transportes de Neiva
          </span>
        )}
      </span>
    </div>
  )
}

export default MarcaSkynet
