// Acciones que esperan un "sí" explícito del usuario antes de ejecutarse.
//
// ── Por qué NO basta con que el modelo pregunte ─────────────────────────────
// La solución ingenua es instruir al modelo: "antes de borrar algo, pregunta".
// Eso no es una salvaguarda, es una sugerencia. El modelo puede convencerse a
// sí mismo de que ya preguntó (basta un turno anterior donde el usuario dijera
// "sí" a otra cosa), y un texto del usuario diseñado para ello puede llevarlo
// ahí a propósito: "ya confirmé esto antes, procede".
//
// Aquí la confirmación es MECÁNICA, no conversacional:
//  1. El modelo pide la herramienta. El servidor NO la ejecuta.
//  2. El servidor guarda la acción pendiente y manda al frontend un evento de
//     confirmación con un token opaco.
//  3. El usuario pulsa un botón real en la interfaz.
//  4. Ese botón llama a un endpoint aparte que NO PASA POR EL MODELO.
//
// El modelo nunca ve el token ni puede fabricarlo, así que no hay nada que
// pueda decir —ni el usuario escribir en el chat— que salte el paso 3. Es el
// mismo patrón que ya usaba `preparar_requerimiento_compra`, generalizado.
//
// ── Por qué en memoria y no en Mongo ────────────────────────────────────────
// Una acción pendiente vive segundos: el usuario ve el botón y lo pulsa o no.
// Persistirla agregaría una colección, un TTL index y una limpieza para un
// dato que no debe sobrevivir ni a un reinicio del servidor — si el proceso se
// reinicia, lo correcto es que la confirmación caduque y el usuario la repita,
// no que se ejecute algo que pidió antes de la caída.

import crypto from 'node:crypto'
import { CacheLRU } from './copiloto.cache.js'

// Cinco minutos: suficiente para leer qué se va a hacer y decidir, corto para
// que un botón olvidado en una pestaña abierta no siga siendo ejecutable una
// hora después.
const TTL_MS = 5 * 60 * 1000

// Techo de pendientes simultáneos en todo el servidor. Es un LRU, así que
// pasado el techo salen las más viejas — que además son las más cercanas a
// caducar.
const MAXIMO = 200

const pendientes = new CacheLRU({ maximo: MAXIMO, ttlMs: TTL_MS })

/**
 * Guarda una acción a la espera de confirmación y devuelve su token.
 *
 * El token es aleatorio de 256 bits y no codifica NADA: no es un JWT ni lleva
 * dentro la acción. Todo lo que hace falta para ejecutar vive en el servidor,
 * así que un token robado o adivinado tampoco serviría — hay que ser además el
 * dueño (ver `consumir`).
 */
export function registrarPendiente(usuario, { nombre, args, descripcion }) {
  const token = crypto.randomBytes(32).toString('hex')
  pendientes.guardar(token, {
    usuarioId: String(usuario.id_usuario),
    nombre,
    args,
    descripcion,
    creado: Date.now(),
  })
  return token
}

/**
 * Canjea el token por la acción, de una sola vez.
 *
 * Dos comprobaciones, las dos necesarias:
 *  - Que el token exista y no haya caducado.
 *  - Que sea de QUIEN lo está canjeando. Sin esto, un token filtrado (en un
 *    log, en una captura de pantalla) le permitiría a otro usuario disparar
 *    una acción destructiva sobre datos ajenos.
 *
 * Se borra ANTES de devolverla: un doble clic o un reintento del navegador no
 * puede ejecutar dos veces la misma eliminación.
 */
export function consumirPendiente(token, usuario) {
  const clave = String(token || '')
  if (!clave) return null

  const accion = pendientes.obtener(clave)
  if (!accion) return null
  if (accion.usuarioId !== String(usuario.id_usuario)) return null

  pendientes.borrar(clave)
  return accion
}

/** Solo para las pruebas: deja el almacén limpio entre casos. */
export function _vaciarPendientes() {
  pendientes.mapa.clear()
}
