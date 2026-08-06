// Caché LRU con TTL, en memoria del proceso. Sin Redis a propósito: el resto
// del proyecto tampoco lo usa (la cola de notificaciones vive en Mongo) y
// meter una dependencia de infraestructura nueva para cachear conversaciones
// de un ERP interno no se paga. Ver el §escalado del plan para cuándo sí.
//
// Dos usos, con parámetros muy distintos:
//  - Conversaciones activas: evita ir a Mongo por el hilo en cada mensaje.
//  - Resultados de herramientas: absorbe la ráfaga de preguntas repetidas
//    ("¿y ahora?" tres veces seguidas) sin repetir el conteo en la base.
//
// Es un Map de JavaScript, que preserva el orden de inserción: eso es todo lo
// que hace falta para un LRU. Al leer una clave se borra y se reinserta, así
// que la más vieja siempre es la primera que devuelve keys().

export class CacheLRU {
  /**
   * @param {object} opciones
   * @param {number} opciones.maximo   Cuántas entradas caben antes de desalojar.
   * @param {number} opciones.ttlMs    Cuánto vale una entrada desde que se escribió.
   */
  constructor({ maximo = 500, ttlMs = 60_000 } = {}) {
    this.maximo = maximo
    this.ttlMs = ttlMs
    this.mapa = new Map()
    // Contadores para poder medir si la caché sirve de algo en producción, en
    // vez de suponerlo. Los expone copiloto.service.js en el log de métricas.
    this.aciertos = 0
    this.fallos = 0
  }

  obtener(clave) {
    const entrada = this.mapa.get(clave)
    if (!entrada) {
      this.fallos++
      return undefined
    }
    if (Date.now() > entrada.expira) {
      // Vencida: se borra al leerla. No hace falta un barrido periódico —
      // las claves que nadie vuelve a pedir salen igual por desalojo LRU.
      this.mapa.delete(clave)
      this.fallos++
      return undefined
    }
    // Reinsertar la mueve al final: pasa a ser la más recientemente usada.
    this.mapa.delete(clave)
    this.mapa.set(clave, entrada)
    this.aciertos++
    return entrada.valor
  }

  guardar(clave, valor, ttlMs = this.ttlMs) {
    if (this.mapa.has(clave)) this.mapa.delete(clave)
    this.mapa.set(clave, { valor, expira: Date.now() + ttlMs })
    // Desaloja de a uno: solo puede haber un excedente por escritura.
    if (this.mapa.size > this.maximo) {
      const masVieja = this.mapa.keys().next().value
      this.mapa.delete(masVieja)
    }
  }

  borrar(clave) {
    this.mapa.delete(clave)
  }

  /**
   * Envuelve una función costosa: devuelve lo cacheado o la ejecuta y guarda.
   *
   * Guarda la PROMESA, no el resultado ya resuelto. Es deliberado: si llegan
   * tres peticiones idénticas antes de que la primera termine (pasa siempre
   * con el botón de micrófono y con quien repite la pregunta impaciente),
   * guardar el resultado dejaría correr las tres consultas a Mongo. Guardando
   * la promesa, las otras dos se cuelgan de la que ya está en vuelo.
   */
  async through(clave, fn, ttlMs = this.ttlMs) {
    const enCache = this.obtener(clave)
    if (enCache !== undefined) return enCache

    const promesa = fn()
    this.guardar(clave, promesa, ttlMs)
    try {
      return await promesa
    } catch (err) {
      // Un fallo no se cachea: la siguiente petición debe poder reintentar.
      this.borrar(clave)
      throw err
    }
  }

  get metricas() {
    const total = this.aciertos + this.fallos
    return {
      entradas: this.mapa.size,
      aciertos: this.aciertos,
      fallos: this.fallos,
      tasaAcierto: total ? +(this.aciertos / total).toFixed(3) : 0,
    }
  }
}

// Resultados de herramientas de solo lectura. TTL corto a propósito: 20 s
// absorbe la ráfaga de repreguntas sin llegar a mostrar un dato viejo. Si
// alguien aprueba un requerimiento y el usuario pregunta enseguida, lo peor
// que puede pasar es que vea el estado de hace veinte segundos.
export const cacheHerramientas = new CacheLRU({ maximo: 300, ttlMs: 20_000 })

// Conversaciones activas, para no ir a Mongo por el hilo en cada mensaje.
// TTL largo porque el hilo se escribe desde este mismo proceso: la entrada en
// caché nunca queda desactualizada respecto de la base por otro camino.
export const cacheConversaciones = new CacheLRU({ maximo: 200, ttlMs: 30 * 60_000 })
