import { useSyncExternalStore } from 'react'

// Huecos de la barra superior donde las páginas pintan contenido propio
// (createPortal). BarraSuperior registra cada nodo con un ref callback; el
// store avisa a quien lo consuma, sin depender del orden de montaje ni de
// document.getElementById.
let slots = { saludo: null, acciones: null }
const oyentes = new Set()

export function registrarSlot(clave, el) {
  if (slots[clave] === el) return
  slots = { ...slots, [clave]: el }
  oyentes.forEach((fn) => fn())
}

const suscribir = (fn) => {
  oyentes.add(fn)
  return () => oyentes.delete(fn)
}

export function useSlotsBarraSuperior() {
  return useSyncExternalStore(suscribir, () => slots)
}
