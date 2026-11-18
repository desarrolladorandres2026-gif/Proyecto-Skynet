import { useMemo, useSyncExternalStore } from 'react'
import { tematicaApi } from '../api/tematica.js'
import { TEMATICAS_ACTIVAS, TEMATICA_POR_DEFECTO } from './config.js'
import { TEMATICAS } from './registro.js'
import { resolverTematica } from './seleccion.js'

// La temática es GLOBAL: la elige un administrador (Sistema → Temática) y se
// guarda en el backend. Aquí solo se lee. Se cachea el último valor en
// localStorage únicamente para no parpadear al abrir la app mientras llega la
// respuesta del servidor.
const CACHE = 'skynet-tematica-modo'

function leerCache() {
  try {
    return localStorage.getItem(CACHE) || TEMATICA_POR_DEFECTO
  } catch {
    return TEMATICA_POR_DEFECTO
  }
}

let modo = leerCache()
const oyentes = new Set()

// Fija el modo vigente (lo llaman la carga inicial y la pantalla de admin).
export function fijarModoTematica(nuevo) {
  if (!nuevo || nuevo === modo) return
  modo = nuevo
  try {
    localStorage.setItem(CACHE, nuevo)
  } catch {
    /* sin storage */
  }
  oyentes.forEach((avisar) => avisar())
}

// Pide al servidor la temática vigente. Si falla se queda con la última conocida.
export async function cargarTematica() {
  try {
    const { modo: delServidor } = await tematicaApi.obtener()
    fijarModoTematica(delServidor)
  } catch {
    /* sin red o sin sesión: se conserva el valor actual */
  }
}

// Temática vigente ahora, fuera de React (p. ej. para el sonido del login).
export function tematicaActual() {
  return TEMATICAS_ACTIVAS ? resolverTematica(modo, TEMATICAS) : null
}

function suscribir(avisar) {
  oyentes.add(avisar)
  return () => oyentes.delete(avisar)
}

// Temática activa del sistema. Distinto del "tema" claro/oscuro de AppLayout:
// esto es la ambientación estacional.
export function useTematica() {
  const preferencia = useSyncExternalStore(suscribir, () => modo, () => TEMATICA_POR_DEFECTO)

  const tematica = useMemo(
    () => (TEMATICAS_ACTIVAS ? resolverTematica(preferencia, TEMATICAS) : null),
    [preferencia]
  )

  return { tematica, modo: preferencia, opciones: TEMATICAS }
}
