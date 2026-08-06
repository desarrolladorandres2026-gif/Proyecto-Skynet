import { detectarIntencion } from './copiloto.intencion.js'
import * as redactar from './copiloto.respuestas.js'

// Ejecuta la intención detectada usando las MISMAS herramientas que usaría el
// modelo, y redacta la respuesta con plantilla. Es el camino rápido: sin
// llamada a Gemini, sin tokens y sin consumir la cuota gratuita diaria que
// comparte todo el Terminal.
//
// ── Por qué recibe `porNombre` en vez de construir las herramientas ─────────
// Esa es LA garantía de seguridad de este archivo. `porNombre` es el mismo Map
// que arma responderStream() con construirHerramientas(usuario), que ya filtró
// por rol y por módulo activo. Si el atajo construyera su propio catálogo,
// habría dos rutas distintas hacia los mismos datos y bastaría con que una se
// desactualizara para abrir un hueco: un rol al que se le quita el acceso a
// ausencias lo perdería en el chat pero lo conservaría en el atajo.
//
// Al reusar el Map, una herramienta ausente (módulo apagado o rol sin acceso)
// simplemente no está, el atajo devuelve null y la pregunta cae al modelo —
// que tampoco la tiene declarada y responderá que está fuera de su alcance.
// El comportamiento es idéntico por los dos caminos porque la fuente del
// permiso es una sola.

// Intención → herramienta que la resuelve. Las de cortesía no aparecen aquí
// porque no consultan nada.
const HERRAMIENTA_DE = {
  resumen_dashboard: 'resumen_dashboard',
  mis_requerimientos: 'mis_requerimientos',
  mis_ausencias: 'mis_ausencias',
  mis_reportes_dano: 'mis_reportes_dano',
  clima: 'consultar_clima',
}

/**
 * @param {string} mensaje  Lo que dijo o escribió el usuario.
 * @param {object} usuario  Usuario autenticado (para personalizar el saludo).
 * @param {Map<string, {ejecutar: Function}>} porNombre Herramientas YA
 *        filtradas por rol y módulo activo.
 * @returns {Promise<{texto: string, intencion: string} | null>} null cuando
 *          esto debe resolverlo el modelo.
 */
export async function resolverAtajo(mensaje, usuario, porNombre) {
  const intencion = detectarIntencion(mensaje)
  if (!intencion) return null

  // ── Cortesía: no toca la base de datos.
  switch (intencion.nombre) {
    case 'saludo':
      return { texto: redactar.saludo(usuario?.nombre_usuario), intencion: intencion.nombre }
    case 'agradecimiento':
      return { texto: redactar.agradecimiento(), intencion: intencion.nombre }
    case 'despedida':
      return { texto: redactar.despedida(), intencion: intencion.nombre }
    case 'sin_contenido':
      return { texto: redactar.sinContenido(), intencion: intencion.nombre }
  }

  const herramienta = porNombre.get(HERRAMIENTA_DE[intencion.nombre])
  if (!herramienta) return null // sin permiso o módulo apagado: que lo explique el modelo

  let datos
  try {
    datos = await herramienta.ejecutar(intencion.args || {})
  } catch {
    // Un fallo de la consulta NO se convierte en un mensaje de error para el
    // usuario: se cae al modelo, que tiene la misma herramienta y sabe
    // explicar el problema con más contexto del que tendría una plantilla.
    return null
  }

  const texto = redactarSegunIntencion(intencion, datos)
  // Si la plantilla no supo qué hacer con lo que volvió (forma inesperada),
  // también se cae al modelo en vez de responder algo a medias.
  return texto ? { texto, intencion: intencion.nombre } : null
}

function redactarSegunIntencion(intencion, datos) {
  switch (intencion.nombre) {
    case 'resumen_dashboard':
      return datos && typeof datos === 'object' ? redactar.resumenTablero(datos) : null
    case 'mis_requerimientos':
      return Array.isArray(datos) ? redactar.listaRequerimientos(datos, intencion.args?.estado) : null
    case 'mis_ausencias':
      return Array.isArray(datos) ? redactar.listaAusencias(datos, intencion.args?.estado) : null
    case 'mis_reportes_dano':
      return Array.isArray(datos) ? redactar.listaDanos(datos) : null
    case 'clima':
      return redactar.clima(datos)
    default:
      return null
  }
}
