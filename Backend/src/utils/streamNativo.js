// Canal de notificaciones propio para la app Android (sin Firebase ni
// terceros): la app mantiene abierta una conexión SSE contra el backend
// (GET /notificaciones/stream) y por ella recibe cada notificación push.
//
// Es memoria del proceso: el backend corre en UN solo proceso (ver
// deploy/ecosystem.config.cjs), igual que el worker de notificaciones que
// llama a publicar(), así que no hace falta un bus externo.
const conexiones = new Map() // `${usuario}:${dispositivo}` -> Set<res>

const clave = (usuario, dispositivo) => `${usuario}:${dispositivo}`

export function registrarConexion(usuario, dispositivo, res) {
  const k = clave(usuario, dispositivo)
  if (!conexiones.has(k)) conexiones.set(k, new Set())
  conexiones.get(k).add(res)
  return () => {
    const set = conexiones.get(k)
    if (!set) return
    set.delete(res)
    if (!set.size) conexiones.delete(k)
  }
}

// true si al menos una conexión viva recibió el evento.
export function publicar(usuario, dispositivo, evento, datos) {
  const set = conexiones.get(clave(usuario, dispositivo))
  if (!set?.size) return false
  const trama = `event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`
  let entregado = false
  for (const res of set) {
    if (res.writableEnded || res.destroyed) continue
    res.write(trama)
    entregado = true
  }
  return entregado
}

export function hayConexion(usuario, dispositivo) {
  return Boolean(conexiones.get(clave(usuario, dispositivo))?.size)
}
