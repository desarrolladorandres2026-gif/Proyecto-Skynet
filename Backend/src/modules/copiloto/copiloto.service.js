import {
  GoogleGenAI,
  createUserContent,
  createModelContent,
  createPartFromFunctionResponse,
} from '@google/genai'
import { env } from '../../config/env.js'
import { construirHerramientas } from './copiloto.herramientas.js'
import { instruccionSistema } from './copiloto.prompt.js'
import { resolverAtajo } from './copiloto.atajos.js'
import {
  abrirConversacion,
  registrarIntercambio,
  turnosParaContexto,
  obtenerHechos,
  sanearTexto,
  actualizarEstado,
} from './copiloto.memoria.js'
import { ESTADOS } from './copiloto.estados.js'
import { registrarPendiente, consumirPendiente } from './copiloto.confirmaciones.js'
import { ErrorValidacion, ErrorConflicto, ErrorAplicacion } from '../../utils/errores.js'

// 'gemini-flash-lite-latest' (hoy resuelve a gemini-3.5-flash-lite), NO
// 'gemini-flash-latest', por dos motivos medidos contra la API real:
//  1. CUOTA: 'gemini-flash-latest' resuelve a gemini-3.6-flash, que en capa
//     gratuita permite solo 20 peticiones POR DÍA para todo el proyecto
//     (quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier) — con eso
//     el copiloto se agota entre dos o tres usuarios y queda inservible.
//  2. LATENCIA: los modelos "flash" razonan antes de responder (gastaban ~250
//     tokens de pensamiento solo para saludar, con varios segundos de espera);
//     el lite responde con 0 tokens de pensamiento en ~890 ms promedio,
//     incluyendo la vuelta en la que decide llamar una herramienta.
// Se usa el alias '-latest' y no una versión con fecha porque Google retira
// las versiones fijas para cuentas nuevas (ya pasó con 'gemini-2.5-flash').
const MODELO = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest'

// Corta el ida-y-vuelta de herramientas si el modelo se queda pidiendo datos
// sin llegar nunca a una respuesta en texto: mejor un error claro que un chat
// que se queda "pensando" para siempre o agota la capa gratuita en una sola
// pregunta.
const MAX_VUELTAS_HERRAMIENTAS = 4

// Techo del mensaje del usuario. Sin él, un cliente podía mandar un texto
// arbitrariamente grande y agotar de una sola petición la cuota gratuita que
// comparte todo el Terminal.
const MAX_CARACTERES_MENSAJE = 2000

// `temperature` baja y `maxOutputTokens` acotado no son ajustes de calidad
// sino de LATENCIA PERCIBIDA, que es lo que se nota en voz: cada token que el
// modelo genera de más es tiempo que el sintetizador sigue hablando después de
// haber dicho lo que importaba. 0.4 mantiene el tono natural sin que se vaya
// por las ramas; 700 tokens son unos 40 segundos de voz, más que suficiente
// para cualquier respuesta de este dominio.
const TEMPERATURA = 0.4
const MAX_TOKENS_RESPUESTA = 700

let cliente = null
function obtenerCliente() {
  if (!env.GEMINI_API_KEY) {
    throw new ErrorConflicto('El copiloto no está configurado: falta GEMINI_API_KEY en el servidor.')
  }
  if (!cliente) cliente = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY })
  return cliente
}

function aContenidoHistorial(turno) {
  return turno.rol === 'user' ? createUserContent(turno.texto) : createModelContent(turno.texto)
}

/**
 * Responde un mensaje, emitiendo eventos a medida que hay algo que mostrar.
 *
 * Eventos que emite, en orden:
 *   {tipo:'inicio', conversacionId}  — apenas se resuelve el hilo. El frontend
 *        lo guarda y lo reenvía en el siguiente mensaje.
 *   {tipo:'delta', texto}            — trozos de la respuesta.
 *   {tipo:'accion', ...}             — una herramienta produjo algo que la
 *        interfaz debe dibujar (hoy: el borrador de requerimiento).
 *   {tipo:'navegacion', ruta, titulo} — el usuario pidió ir a una sección y
 *        tiene permiso: el frontend hace el navigate().
 *   {tipo:'confirmacion', token, ...} — una herramienta destructiva quedó a la
 *        espera de un botón real (ver copiloto.confirmaciones.js).
 *   {tipo:'fin', via}                — 'atajo' o 'modelo', para poder medir en
 *        producción qué proporción del tráfico se resuelve sin LLM.
 *
 * ── Por qué eventos tipados y no texto libre ────────────────────────────────
 * El frontend NUNCA interpreta la prosa del modelo para decidir qué hacer. Si
 * la navegación dependiera de detectar "voy a abrir los reportes" en el texto,
 * bastaría con que el modelo redactara distinto —o con que el usuario le
 * pidiera que lo dijera— para disparar una acción no pretendida. Cada acción
 * de interfaz nace de una herramienta ejecutada y verificada en el servidor.
 *
 * ── El historial ya NO viene del cliente ────────────────────────────────────
 * Antes el frontend mandaba los turnos previos y aquí se reenviaban tal cual a
 * Gemini. Eso permitía fabricar turnos con rol:'model' y ponerle palabras en
 * la boca al asistente (ver ConversacionCopiloto.js). Ahora el cliente solo
 * manda un id opaco y el hilo se lee del servidor.
 *
 * @param {{mensaje: string, conversacionId?: string, signal?: AbortSignal, ip?: string}} entrada
 * @param {object} usuario  req.usuario
 */
export async function* responderStream({ mensaje, conversacionId, signal, ip }, usuario) {
  const texto = sanearTexto(mensaje, MAX_CARACTERES_MENSAJE)
  if (!texto) throw new ErrorValidacion('El mensaje no puede estar vacío')

  // El cliente se construye ANTES que nada: si falta la API key hay que fallar
  // con el 409 claro de siempre, incluso para las preguntas que iban a
  // resolverse por atajo. Responder unas sí y otras no según el camino interno
  // sería incomprensible para quien lo usa.
  const ai = obtenerCliente()

  const [conv, herramientas, hechos] = await Promise.all([
    abrirConversacion(conversacionId, usuario),
    construirHerramientas(usuario, { ip }),
    obtenerHechos(usuario.id_usuario),
  ])

  // Se emite de una vez, antes de cualquier consulta pesada: el frontend
  // necesita el id para el siguiente mensaje aunque este se cancele a medias.
  yield { tipo: 'inicio', conversacionId: conv.id }

  const porNombre = new Map(herramientas.map((h) => [h.declaracion.name, h]))

  // ── Camino rápido: sin modelo, sin tokens ────────────────────────────────
  const atajo = await resolverAtajo(texto, usuario, porNombre)
  if (atajo) {
    yield { tipo: 'delta', texto: atajo.texto }
    registrarIntercambio(conv, { pregunta: texto, respuesta: atajo.texto, tema: atajo.intencion })
    yield { tipo: 'fin', via: 'atajo', intencion: atajo.intencion }
    return
  }

  // ── Camino normal: el modelo ─────────────────────────────────────────────
  const config = {
    systemInstruction: instruccionSistema(usuario, hechos, conv.temas, conv.estado),
    temperature: TEMPERATURA,
    maxOutputTokens: MAX_TOKENS_RESPUESTA,
    // Aborta la lectura del stream cuando el usuario cierra el chat o hace
    // otra pregunta encima. OJO con lo que esto SÍ y NO hace: según la propia
    // documentación del SDK, cancela del lado del cliente pero no detiene la
    // generación en Google ni evita el consumo de cuota. Lo que gana es dejar
    // de ocupar el socket y el proceso con una respuesta que ya nadie va a
    // leer — no ahorra cuota, y decir lo contrario sería falso.
    abortSignal: signal,
  }
  // Sin herramientas (rol muy acotado + módulos apagados) se omite `tools` por
  // completo: mandar un array vacío es un 400 de la API.
  if (herramientas.length) {
    config.tools = [{ functionDeclarations: herramientas.map((h) => h.declaracion) }]
  }

  const contents = [...turnosParaContexto(conv).map(aContenidoHistorial), createUserContent(texto)]

  for (let vuelta = 0; vuelta < MAX_VUELTAS_HERRAMIENTAS; vuelta++) {
    // Se acumulan las partes de TODOS los trozos del turno: es lo que después
    // se reenvía como turno del modelo (ver más abajo por qué no se
    // reconstruye), y de ahí se leen las llamadas a herramientas.
    const partesTurno = []
    let textoTurno = ''
    try {
      const flujo = await ai.models.generateContentStream({ model: MODELO, contents, config })
      for await (const trozo of flujo) {
        for (const parte of trozo.candidates?.[0]?.content?.parts || []) {
          partesTurno.push(parte)
          // `thought: true` son las partes de razonamiento interno del modelo:
          // no son respuesta para el usuario y no deben aparecer en el chat.
          if (parte.text && !parte.thought) {
            textoTurno += parte.text
            yield { tipo: 'delta', texto: parte.text }
          }
        }
      }
    } catch (err) {
      // Cancelación del propio usuario: no es un fallo que haya que mostrar ni
      // registrar. Se corta en silencio y se deja la conversación como estaba.
      if (err.name === 'AbortError' || signal?.aborted) return
      // El SDK de Gemini propaga tal cual el status HTTP del error de GOOGLE
      // en `err.status` (401 con una API key inválida, 429 sin cuota, etc.).
      // Dejarlo pasar sin envolver hace que errorHandler.js lo reenvíe como si
      // fuera el status de ESTA api — un 401 de Google se confunde con una
      // sesión de Skynet expirada, y el frontend cierra sesión a cualquiera
      // que le pregunte algo al copiloto (ver api/client.js: todo 401 dispara
      // 'skynet:logout'). Se normaliza a 502: es un fallo del servicio
      // externo, nunca de la sesión del usuario.
      throw new ErrorAplicacion(`El servicio de IA no respondió correctamente: ${err.message}`, 502)
    }

    const llamadas = partesTurno.filter((p) => p.functionCall).map((p) => p.functionCall)
    if (!llamadas.length) {
      const textoRespuesta = textoTurno.trim() || 'No tengo una respuesta para eso.'
      registrarIntercambio(conv, { pregunta: texto, respuesta: textoRespuesta })
      // Si el turno terminó en pregunta, el flujo queda esperando la
      // respuesta del usuario y se guarda la pregunta textual para que el
      // próximo mensaje corto ("sí", "urgente") se pueda leer en su contexto
      // (ver estadoConversacion en copiloto.prompt.js). Si no, el flujo que
      // hubiera en curso se da por cerrado — la entidad activa y el borrador
      // se conservan (por si el usuario retoma), pero deja de "esperar" nada.
      if (/\?\s*$/.test(textoRespuesta)) {
        actualizarEstado(conv, { flujo: ESTADOS.WAITING_USER_RESPONSE, ultimaPregunta: textoRespuesta })
      } else if (conv.estado?.flujo && conv.estado.flujo !== ESTADOS.IDLE) {
        actualizarEstado(conv, { flujo: ESTADOS.COMPLETED, ultimaPregunta: null })
      }
      yield { tipo: 'fin', via: 'modelo' }
      return
    }

    // Reenvía el turno del modelo TAL CUAL lo devolvió la API, no reconstruido
    // desde `functionCalls` (que solo trae name/args/id): los modelos de
    // "razonamiento" firman cada parte de function call con un
    // thoughtSignature que hay que reenviar íntegro en el siguiente turno —
    // omitirlo lo rechaza con 400 ("Function call is missing a
    // thought_signature").
    contents.push({ role: 'model', parts: partesTurno })

    const resultados = await Promise.all(
      llamadas.map(async (llamada) => {
        const id = llamada.id || llamada.name
        // `porNombre` solo contiene las herramientas que este rol puede usar
        // (ver construirHerramientas): si el modelo alucina un nombre fuera de
        // esa lista, aquí se corta — el alcance se verifica al EJECUTAR, no
        // solo al declarar.
        const herramienta = porNombre.get(llamada.name)
        if (!herramienta) {
          return {
            id,
            name: llamada.name,
            response: { error: 'Esa consulta está fuera del alcance del rol de este usuario.' },
          }
        }

        // ── Acción destructiva: se PARA aquí, no se ejecuta ────────────────
        // El modelo la pidió, pero pedir no es ejecutar. Se guarda pendiente y
        // se le devuelve un resultado que le dice explícitamente que todavía
        // no pasó nada, para que no le anuncie al usuario algo que no ocurrió.
        if (herramienta.requiereConfirmacion) {
          const args = llamada.args || {}
          // La descripción puede consultar la base (para decir QUÉ se va a
          // cancelar, no solo "confirma la acción"), así que se espera. Si esa
          // consulta falla, la confirmación NO se cae: se muestra un texto
          // genérico. Perder el detalle es aceptable; perder el botón dejaría
          // al usuario sin forma de completar lo que pidió.
          let descripcion = null
          try {
            descripcion = (await herramienta.descripcionConfirmacion?.(args)) || null
          } catch {
            descripcion = null
          }
          const token = registrarPendiente(usuario, { nombre: llamada.name, args, descripcion })
          return {
            id,
            name: llamada.name,
            confirmacion: { token, args, descripcion },
            response: {
              pendiente: true,
              mensaje:
                'NO se ha ejecutado nada. La acción quedó esperando que el usuario la confirme con un botón en la interfaz. Explícale en una frase qué va a pasar si confirma y no digas que ya está hecho.',
            },
          }
        }

        try {
          const resultado = await herramienta.ejecutar(llamada.args || {})
          return { id, name: llamada.name, response: { resultado } }
        } catch (err) {
          return { id, name: llamada.name, response: { error: err.message } }
        }
      })
    )

    // Herramientas que producen una ACCIÓN para la interfaz: además de
    // dárselas al modelo para que las describa, se reenvían al frontend para
    // que las ejecute o dibuje. El modelo únicamente las VE — la decisión de
    // guardar o de confirmar nunca pasa por él.
    for (const r of resultados) {
      if (r.confirmacion) {
        actualizarEstado(conv, { flujo: ESTADOS.CONFIRMING })
        yield {
          tipo: 'confirmacion',
          herramienta: r.name,
          token: r.confirmacion.token,
          descripcion: r.confirmacion.descripcion,
          datos: r.confirmacion.args,
        }
        continue
      }
      if (r.name === 'preparar_requerimiento_compra' && r.response?.resultado?.borrador) {
        // Había ya un borrador de este mismo tipo → es una edición sobre lo
        // que existía (EDITING), no un borrador nuevo (CREATING).
        const yaHabiaBorrador = conv.estado?.entidadActiva?.tipo === 'requerimiento_compra'
        actualizarEstado(conv, {
          flujo: yaHabiaBorrador ? ESTADOS.EDITING : ESTADOS.CREATING,
          entidadActiva: { tipo: 'requerimiento_compra', id: null },
          borrador: r.response.resultado,
        })
        yield { tipo: 'accion', accion: 'requerimiento_compra_borrador', datos: r.response.resultado }
      }
      // La navegación la marca la propia herramienta con `navegacion: true`
      // (ver abrir_seccion), no el nombre de la función: así, el día que haya
      // otra herramienta que también navegue, no hay que tocar este bucle.
      if (r.response?.resultado?.navegacion) {
        const { ruta, titulo, clave } = r.response.resultado
        yield { tipo: 'navegacion', ruta, titulo, clave }
      }
    }

    contents.push(
      createUserContent(resultados.map((r) => createPartFromFunctionResponse(r.id, r.name, r.response)))
    )
  }

  throw new ErrorConflicto('El copiloto no pudo completar la respuesta (demasiadas consultas encadenadas).')
}

/**
 * Ejecuta una acción que el usuario ya confirmó con un botón.
 *
 * ── Este camino NO PASA POR GEMINI ──────────────────────────────────────────
 * Es lo que hace que la confirmación signifique algo. El modelo propuso la
 * acción en su momento y ahí terminó su participación: aquí solo se canjea un
 * token que el servidor emitió, contra el catálogo de herramientas que se
 * vuelve a construir para ESTE usuario y en ESTE instante.
 *
 * Reconstruir el catálogo en vez de guardarlo con la acción pendiente es
 * deliberado: entre que el modelo propuso y el usuario confirmó pudieron
 * revocarle el permiso o apagar el módulo. Lo que manda es el permiso de
 * ahora, no el de hace cinco minutos.
 *
 * @param {string} token   El que viajó en el evento {tipo:'confirmacion'}.
 * @param {object} usuario req.usuario
 * @param {{ip?: string}} contexto
 */
export async function ejecutarConfirmada(token, usuario, contexto = {}) {
  const accion = consumirPendiente(token, usuario)
  if (!accion) {
    throw new ErrorValidacion('Esa confirmación ya no es válida. Vuelve a pedirlo y confírmalo de nuevo.')
  }

  const herramientas = await construirHerramientas(usuario, contexto)
  const herramienta = herramientas.find((h) => h.declaracion.name === accion.nombre)
  if (!herramienta) {
    throw new ErrorConflicto('Ya no tienes permiso para realizar esa acción.')
  }

  // `requiereConfirmacion` se envuelve para que la herramienta NO se ejecute
  // por el camino del modelo; aquí se llama a `ejecutar` directamente, que es
  // el único punto del sistema donde una acción confirmada corre de verdad.
  const resultado = await herramienta.ejecutar(accion.args || {})
  return { herramienta: accion.nombre, resultado }
}
