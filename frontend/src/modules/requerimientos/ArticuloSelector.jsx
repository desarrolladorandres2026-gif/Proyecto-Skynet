import { useEffect, useRef, useState } from 'react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { Input } from '../../components/ui.jsx'

// Autocompletar contra el catálogo de Bodega. Las sugerencias se muestran EN
// FLUJO (no como menú flotante) porque el selector vive dentro de tablas con
// overflow, donde un menú absoluto quedaría recortado en las últimas filas.
//
// `texto` es lo que escribe la persona; `onElegir(articulo)` se dispara al
// tocar una sugerencia. El padre decide qué guardar y cuándo lo escrito deja
// de ser "del catálogo" (ver FormularioCompra).
export default function ArticuloSelector({ texto, onTexto, onElegir, vinculado = false, required = false, placeholder = '' }) {
  const [sugerencias, setSugerencias] = useState([])
  const [abierto, setAbierto] = useState(false)
  const pedido = useRef(0)

  useEffect(() => {
    const q = texto.trim()
    if (!abierto || q.length < 2) {
      setSugerencias([])
      return undefined
    }
    const id = ++pedido.current
    const t = setTimeout(() => {
      requerimientosApi
        .buscarArticulos(q)
        // Respuesta vieja de una búsqueda anterior: se descarta.
        .then((data) => id === pedido.current && setSugerencias(data.articulos || []))
        .catch(() => id === pedido.current && setSugerencias([]))
    }, 250)
    return () => clearTimeout(t)
  }, [texto, abierto])

  function elegir(articulo) {
    setAbierto(false)
    setSugerencias([])
    onElegir(articulo)
  }

  return (
    <div>
      <Input
        required={required}
        value={texto}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        onKeyDown={(e) => e.key === 'Escape' && setAbierto(false)}
        onChange={(e) => {
          setAbierto(true)
          onTexto(e.target.value)
        }}
      />
      {abierto && sugerencias.length > 0 && (
        <ul className="mt-1 divide-y divide-brand-600/10 overflow-hidden rounded border border-brand-600/30 bg-white text-sm dark:divide-brand-400/10 dark:border-brand-400/20 dark:bg-slate-900">
          {sugerencias.map((a) => (
            <li key={a._id}>
              <button
                type="button"
                // mouseDown (no click): corre antes del blur que cerraría la lista.
                onMouseDown={(e) => {
                  e.preventDefault()
                  elegir(a)
                }}
                className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-brand-50 dark:hover:bg-brand-900/30"
              >
                <span className="text-slate-800 dark:text-slate-100">{a.nombre}</span>
                <span className="panel-mono shrink-0 text-xs uppercase text-slate-700 dark:text-slate-300">{a.grupo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={`mt-1 text-xs ${vinculado ? 'text-accent-700 dark:text-accent-400' : 'text-slate-700 dark:text-slate-300'}`}>
        {vinculado ? 'Del catálogo de Bodega' : 'Escribe y elige del catálogo para que Bodega lo identifique'}
      </p>
    </div>
  )
}
