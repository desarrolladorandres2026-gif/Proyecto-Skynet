import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '../lib/cn.js'
import { TematicaLateral } from '../tematicas/index.js'
import { PuntoNovedad } from '../components/PuntoNovedad.jsx'
import { SIN_NOVEDADES } from '../hooks/useNovedades.js'

const coincide = (pathname, to) =>
  to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`)

const esActivo = (pathname, item) => (item.end ? pathname === item.to : coincide(pathname, item.to))

// Fila base: icono a la izquierda, texto, y una barra a la izquierda que marca
// dónde estás. Sin animaciones decorativas: lo activo se distingue por fondo,
// peso y barra lateral.
const fila = 'flex w-full items-center gap-3 border-l-4 px-4 py-3 text-left text-sm text-papel no-underline! transition-colors'
const filaActiva = 'border-papel bg-white/30 font-semibold'
const filaInactiva = 'border-transparent hover:bg-white/20'

function Icono({ icon: Icon }) {
  return Icon ? <Icon aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={1.5} /> : <span className="h-5 w-5 shrink-0" />
}

// Navegación lateral. Módulos de un solo ítem = enlace directo. Los demás son
// categorías desplegables (solo una abierta a la vez; por defecto la de la ruta
// actual). Las secciones de la categoría abierta se sangran bajo ella.
// `novedades` (useNovedades) pinta el punto en lo nuevo: en el enlace mismo, o
// en la categoría mientras está cerrada (abierta, el punto baja a su sección).
export default function BarraLateral({ modulosVisibles, novedades = SIN_NOVEDADES }) {
  const { pathname } = useLocation()
  const [expandida, setExpandida] = useState(null)
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false)

  useEffect(() => {
    setMenuMovilAbierto(false)
    setExpandida(null) // al navegar, vuelve a seguir la categoría activa
  }, [pathname])

  const categoriaActiva =
    modulosVisibles.find((m) => m.items.length > 1 && m.items.some((i) => coincide(pathname, i.to))) ?? null
  const abiertaKey = expandida === null ? categoriaActiva?.key : expandida
  const moduloActual =
    categoriaActiva ?? modulosVisibles.find((m) => m.items.length === 1 && coincide(pathname, m.items[0].to))
  const etiquetaActual = moduloActual?.label ?? 'Menú'

  const cerrarMovil = () => setMenuMovilAbierto(false)

  return (
    <>
      <button
        type="button"
        aria-expanded={menuMovilAbierto}
        aria-controls="menu-principal"
        onClick={() => setMenuMovilAbierto((v) => !v)}
        className="flex items-center justify-between border-b border-white/30 bg-[#00AAFF] px-4 py-3 text-left text-sm font-semibold text-papel md:hidden"
      >
        <span>{menuMovilAbierto ? 'Cerrar menú' : `Menú: ${etiquetaActual}`}</span>
        <ChevronDown aria-hidden="true" className={cn('h-4 w-4 transition-transform', menuMovilAbierto && 'rotate-180')} />
      </button>
      <nav
        id="menu-principal"
        aria-label="Menú principal"
        className={cn('shrink-0 bg-[#00AAFF] md:flex md:w-56 md:flex-col md:overflow-y-auto', menuMovilAbierto ? 'block' : 'hidden')}
      >
        <TematicaLateral zona="fondo" />
        <ul className="py-2 md:flex-1">
          {modulosVisibles.map((m) => {
            if (m.items.length === 1) {
              const item = m.items[0]
              const activo = esActivo(pathname, item)
              return (
                <li key={m.key}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={cerrarMovil}
                    aria-current={activo ? 'page' : undefined}
                    className={cn(fila, activo ? filaActiva : filaInactiva)}
                  >
                    <Icono icon={m.icon} />
                    <span>{m.label}</span>
                    {novedades.esNueva(item) ? <PuntoNovedad className="ml-auto" /> : null}
                  </NavLink>
                </li>
              )
            }

            const abierta = abiertaKey === m.key
            const esActual = m === categoriaActiva
            return (
              <li key={m.key}>
                <button
                  type="button"
                  aria-expanded={abierta}
                  onClick={() => setExpandida(abierta ? '' : m.key)}
                  className={cn(
                    fila,
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-papel',
                    esActual ? 'border-papel font-semibold' : filaInactiva,
                    esActual && !abierta && 'bg-white/30',
                  )}
                >
                  <Icono icon={m.icon} />
                  <span className="flex-1">{m.label}</span>
                  {!abierta && novedades.moduloTieneNovedad(m) ? <PuntoNovedad /> : null}
                  <ChevronDown
                    aria-hidden="true"
                    className={cn('h-4 w-4 shrink-0 opacity-70 transition-transform', abierta && 'rotate-180')}
                  />
                </button>
                {abierta ? (
                  <ul aria-label={m.label} className="py-1">
                    {m.items.map((item) => {
                      const activo = esActivo(pathname, item)
                      return (
                        <li key={item.to}>
                          <NavLink
                            to={item.to}
                            end={item.end}
                            onClick={cerrarMovil}
                            aria-current={activo ? 'page' : undefined}
                            className={cn(
                              'flex items-center justify-between gap-2 border-l-4 py-2 pl-12 pr-4 text-sm text-papel no-underline! transition-colors',
                              activo ? 'border-papel bg-white/30 font-semibold' : 'border-transparent opacity-85 hover:bg-white/20 hover:opacity-100',
                            )}
                          >
                            {item.label}
                            {novedades.esNueva(item) ? <PuntoNovedad /> : null}
                          </NavLink>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
        <TematicaLateral zona="pie" />
      </nav>
    </>
  )
}
