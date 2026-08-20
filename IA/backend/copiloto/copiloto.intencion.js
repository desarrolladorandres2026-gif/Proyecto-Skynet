import { tokenizar, buscarToken, normalizar } from './copiloto.texto.js'

// Router de intención determinista: decide, SIN llamar al modelo, si una frase
// es una de las pocas preguntas de altísima frecuencia que el backend puede
// contestar solo con datos + plantilla.
//
// Por qué existe: el 80% del tráfico real de un asistente de ERP son cuatro o
// cinco preguntas ("¿qué tengo pendiente?", "¿cómo va mi requerimiento?",
// "¿me aprobaron las vacaciones?"). Mandarlas todas a Gemini cuesta ~800 ms de
// latencia, ~700 tokens de prompt y una petición de la cuota gratuita diaria
// que es COMPARTIDA por todo el Terminal. Resolverlas aquí las deja en el
// tiempo de la consulta a Mongo (~40 ms) y en cero tokens.
//
// ── Criterio de diseño: PRECISIÓN sobre cobertura ──────────────────────────
// Un falso negativo cuesta 800 ms (la pregunta cae al LLM, que la responde
// bien igual). Un falso positivo entrega una plantilla equivocada con
// seguridad absoluta y sin forma de que el usuario note que se enrutó mal.
// Los dos errores no valen lo mismo, así que TODA duda cae al LLM: cada regla
// exige una señal positiva explícita y ninguna señal de descarte.

// Verbos que implican CREAR o MODIFICAR algo. Su presencia descarta cualquier
// atajo de consulta: "mis requerimientos" es una lista, pero "quiero pedir un
// requerimiento" es el flujo de borrador, que necesita al modelo para extraer
// productos y cantidades del lenguaje natural.
//
// Se comparan por IGUALDAD EXACTA, sin distancia ni prefijo, y por eso las
// conjugaciones van enumeradas a mano. El motivo es una ambigüedad real del
// español que ninguna tolerancia resuelve: el sustantivo "reporte" está a UNA
// edición del verbo "reporta", así que cualquier match difuso convierte "mis
// reportes de daño" (consulta) en "reportar un daño" (escritura). Enumerar es
// verboso pero es lo único que distingue las dos.
//
// El costo de que falte una conjugación es acotado: la frase cae en un atajo
// de SOLO LECTURA (lista lo que ya existe) en vez de en el flujo de creación.
// Es una respuesta pobre, no una acción indebida — ninguna de estas rutas
// escribe en la base de datos.
const VERBOS_ESCRITURA = new Set([
  'pedir', 'pedirle', 'pide', 'pido', 'pidiendo', 'solicitar', 'solicito', 'solicita',
  'crear', 'crea', 'creo', 'creame', 'nuevo', 'nueva', 'necesito', 'necesitamos',
  'necesitaria', 'quisiera', 'comprar', 'compra', 'compre', 'comprame',
  'registrar', 'registra', 'reportar', 'reportarte', 'reporta', 'radicar', 'radica',
  'hacer', 'hazme', 'haz', 'hagame', 'mandar', 'manda', 'enviar', 'envia', 'enviame',
  'aprobar', 'aprueba', 'apruebame', 'rechazar', 'rechaza', 'cancelar', 'cancela',
  'cancelame', 'modificar', 'modifica', 'cambiar', 'cambia', 'cambiame',
  'editar', 'edita', 'borrar', 'borra', 'eliminar', 'elimina', 'agregar', 'agrega',
  'anadir', 'anade', 'actualizar', 'actualiza',
])

// Verbos que piden IR a algún lado, no consultar un dato. Descartan el atajo
// por la misma lógica que VERBOS_ESCRITURA: la frase no pide información sino
// una acción, y la acción la resuelve `abrir_seccion` a través del modelo.
//
// Sin esto, "abre el panel" tomaba el atajo de `resumen_dashboard` y
// respondía con el resumen en texto en vez de navegar. Para el usuario eso se
// lee como que el asistente ignoró lo que le pidió.
//
// La lista es CORTA y deliberadamente NO incluye "muestra"/"muéstrame": esos
// son ambiguos y se usan mucho más como consulta ("muéstrame mis
// requerimientos") que como navegación. Al ser ambiguos, el criterio de
// precisión sobre cobertura de este archivo dice dejarlos como están: quien
// diga "muéstrame los reportes" recibirá la lista, que es una respuesta útil,
// no una equivocada.
const VERBOS_NAVEGACION = new Set([
  'abre', 'abrir', 'abreme', 'abrame', 'abra',
  'llevame', 'lleva', 'llevar', 'ir', 'vamos', 'anda', 'andate',
  'navega', 'navegar', 'entra', 'entrar', 'ingresa', 'ingresar',
])

// Señales de que la persona quiere una EXPLICACIÓN o un juicio, no un dato.
// Eso es justo lo que un modelo hace bien y una plantilla no puede improvisar.
//
// Va como expresión regular sobre la frase COMPLETA, no como lista de tokens,
// por dos razones que se descubrieron probando:
//  1. "por qué" son dos palabras que tokenizar() borra por vacías, así que
//     como token nunca llega: el marcador tiene que leerse antes de tokenizar.
//  2. "cómo" a secas NO puede descartar. "¿Cómo van mis requerimientos?" es la
//     pregunta más frecuente de todo el sistema y es un atajo perfecto; lo que
//     pide explicación es "cómo hago", "cómo funciona", "cómo pido". Solo esas
//     formas compuestas descartan.
const MARCADORES_RAZONAMIENTO =
  /\b(por\s?que|porque|para\s?que|explica|explicame|explicar|que\s+significa|significa|diferencia|deberia|me\s+conviene|recomienda|recomiendas|analiza|compara|ayudame\s+a|como\s+(hago|puedo|se|funciona|es|seria|pido|creo|reporto|solicito))\b/

const OBJETO_REQUERIMIENTO = ['requerimiento', 'requerimientos', 'requerimeinto', 'pedido', 'pedidos', 'solicitud', 'solicitudes', 'compra', 'compras']
const OBJETO_AUSENCIA = ['ausencia', 'ausencias', 'vacacion', 'vacaciones', 'permiso', 'permisos', 'incapacidad', 'incapacidades', 'licencia', 'licencias']
const OBJETO_DANO = ['dano', 'danos', 'averia', 'averias', 'novedad', 'novedades', 'falla', 'fallas', 'reporte', 'reportes', 'danado']
const OBJETO_PENDIENTE = ['pendiente', 'pendientes', 'resumen', 'tablero', 'dashboard', 'panel', 'tareas', 'pendejadas']
const OBJETO_CLIMA = ['clima', 'tiempo', 'temperatura', 'lluvia', 'llover', 'lloviendo', 'calor', 'frio', 'grados']

// Hora y fecha entran al camino rápido por la misma razón que el saludo: son
// de las preguntas más repetidas que existen, la respuesta es una línea, y
// gastar en ellas una petición de la cuota gratuita que comparte todo el
// Terminal no se justifica.
//
// Las dos listas son CORTAS y exactas a propósito. `coincide()` exige
// igualdad para palabras de menos de 6 letras (ver copiloto.texto.js), así
// que "hora" no puede colisionar con "ahora" —que además es palabra vacía— ni
// "dia" con "día de pago". Cualquier frase más elaborada supera el tope de
// tokens y cae al modelo, que es lo correcto.
const OBJETO_HORA = ['hora', 'horas']
const OBJETO_FECHA = ['fecha', 'dia', 'hoy']

// Estados que la persona nombra en voz alta, mapeados al valor exacto que
// guarda cada módulo. La clave es lo que DICE, el valor lo que consulta.
const ESTADOS_REQUERIMIENTO = {
  pendiente: 'pendiente_financiero',
  pendientes: 'pendiente_financiero',
  financiero: 'pendiente_financiero',
  bodega: 'pendiente_bodega',
  despacho: 'pendiente_bodega',
  rechazado: 'rechazado',
  rechazados: 'rechazado',
  negado: 'rechazado',
  negados: 'rechazado',
}
const ESTADOS_AUSENCIA = {
  pendiente: 'pendiente',
  pendientes: 'pendiente',
  aprobada: 'aprobada',
  aprobadas: 'aprobada',
  aprobado: 'aprobada',
  rechazada: 'rechazada',
  rechazadas: 'rechazada',
  negada: 'rechazada',
}

// Saludos y cierres de cortesía. Se resuelven con plantilla porque gastar una
// petición de la cuota gratuita diaria del Terminal en contestar "hola" es
// indefendible, y porque la respuesta instantánea es justo lo que hace que un
// asistente de voz se sienta vivo.
const SALUDOS = ['hola', 'buenas', 'buenos', 'quiubo', 'quihubo', 'qubo', 'holis', 'aló', 'alo', 'hey', 'saludos']
const AGRADECIMIENTOS = ['gracias', 'grasias', 'agradecido', 'agradecida', 'chevere', 'listo', 'perfecto', 'vale', 'bacano']
const DESPEDIDAS = ['chao', 'chau', 'adios', 'hasta', 'nos', 'bye', 'hastaluego']

// Cuántos tokens significativos puede tener una frase para seguir siendo
// candidata a atajo. Una frase larga casi siempre trae un matiz que la
// plantilla no cubre ("mis requerimientos de la semana pasada que iban para
// bodega pero se devolvieron") — mejor que la lea el modelo.
//
// El tope es 5 y no 7 porque hay margen de sobra: medidas contra las frases
// reales que SÍ deben tomar el atajo, ninguna pasa de 4 tokens una vez
// descontadas las palabras vacías ("cómo van mis requerimientos" son 3). Cada
// token extra que se permita solo agrega frases con calificativos que la
// plantilla ignoraría en silencio.
const MAX_TOKENS_ATAJO = 5

/**
 * Detecta la intención de una frase.
 *
 * Devuelve `null` cuando no hay una coincidencia inequívoca — que es el caso
 * mayoritario y el correcto: significa "esto lo resuelve el modelo".
 *
 * @returns {{nombre: string, args?: object} | null}
 */
export function detectarIntencion(texto) {
  const plano = normalizar(texto)
  if (!plano) return null
  const tokens = tokenizar(plano)

  // ── Cortesía: se decide sobre la frase COMPLETA, no por contener la
  // palabra. "hola" es un saludo; "hola, ¿cuántos requerimientos tengo?" es
  // una consulta que empieza con un saludo, y contestarle solo "¡Hola!" sería
  // ignorar la pregunta. De ahí el tope de 3 palabras.
  //
  // Se mira `crudas` (la frase normalizada sin tokenizar) y no `tokens`
  // porque varias fórmulas de cortesía —"gracias", "listo", "bueno"— están en
  // la lista de muletillas de tokenizar(), que es correcto cuando acompañan a
  // una consulta ("muéstrame lo mío, gracias") pero las borraría justo cuando
  // son TODO el mensaje.
  const crudas = plano.split(' ').filter(Boolean)
  if (crudas.length <= 3) {
    if (buscarToken(crudas, AGRADECIMIENTOS)) return { nombre: 'agradecimiento' }
    if (buscarToken(crudas, DESPEDIDAS)) return { nombre: 'despedida' }
    if (buscarToken(crudas, SALUDOS)) return { nombre: 'saludo' }
  }
  // Solo muletillas y nada más: pudo ser un "oye Skynet" suelto esperando que
  // la persona siga hablando.
  if (tokens.length === 0) return { nombre: 'sin_contenido' }

  // ── Descartes: cualquiera de estas señales manda la frase al modelo.
  if (tokens.length > MAX_TOKENS_ATAJO) return null
  if (MARCADORES_RAZONAMIENTO.test(plano)) return null
  // Igualdad exacta sobre las palabras crudas, no sobre `tokens`: el descarte
  // por verbo tiene que ver la frase tal como se dijo (ver VERBOS_ESCRITURA).
  if (crudas.some((p) => VERBOS_ESCRITURA.has(p) || VERBOS_NAVEGACION.has(p))) return null

  // ── Clima: consulta externa con atajo. Necesita una ciudad; si no la
  // nombran se asume Neiva (donde está el Terminal), que es lo que quiere
  // decir alguien que pregunta "¿cómo está el clima?" desde aquí.
  if (buscarToken(tokens, OBJETO_CLIMA)) {
    return { nombre: 'clima', args: { ciudad: extraerCiudad(plano) || 'Neiva' } }
  }

  // ── Hora y fecha. Van DESPUÉS del clima, y el orden importa: "el clima de
  // hoy" contiene 'hoy', que es marcador de fecha, pero la pregunta es del
  // clima. El vocabulario de clima es el más específico de los tres, así que
  // gana; al revés, toda pregunta meteorológica que mencione "hoy" o "el día"
  // se contestaría con la fecha.
  //
  // `extraerCiudad` sirve tal cual para el lugar: descarta "hoy"/"ahora" como
  // si fueran ciudades, que es justo lo que aparece en estas frases ("¿qué
  // hora es ahora?").
  if (buscarToken(tokens, OBJETO_HORA)) {
    return { nombre: 'hora', args: { lugar: extraerCiudad(plano) || undefined } }
  }
  if (buscarToken(tokens, OBJETO_FECHA)) {
    return { nombre: 'fecha', args: { lugar: extraerCiudad(plano) || undefined } }
  }

  // ── Consultas de módulo. El objeto manda; el estado es opcional.
  if (buscarToken(tokens, OBJETO_REQUERIMIENTO)) {
    return { nombre: 'mis_requerimientos', args: { estado: extraerEstado(tokens, ESTADOS_REQUERIMIENTO) } }
  }
  if (buscarToken(tokens, OBJETO_AUSENCIA)) {
    return { nombre: 'mis_ausencias', args: { estado: extraerEstado(tokens, ESTADOS_AUSENCIA) } }
  }
  if (buscarToken(tokens, OBJETO_DANO)) {
    return { nombre: 'mis_reportes_dano', args: {} }
  }
  // "Pendientes" va de último a propósito: es el más genérico y sería el que
  // se robaría "mis requerimientos pendientes", que debe ir a la lista
  // concreta y no al resumen del tablero.
  if (buscarToken(tokens, OBJETO_PENDIENTE)) {
    return { nombre: 'resumen_dashboard', args: {} }
  }

  return null
}

// El estado solo cuenta si la persona lo dijo; si no, la herramienta devuelve
// todo y la plantilla lo resume.
function extraerEstado(tokens, mapa) {
  for (const t of tokens) {
    if (mapa[t]) return mapa[t]
  }
  return undefined
}

// La ciudad es lo que va después de "en" / "de" en frases del tipo "clima en
// Bogotá". Se lee sobre el texto normalizado SIN tokenizar porque tokenizar()
// borra justamente las preposiciones que marcan dónde empieza el nombre.
function extraerCiudad(plano) {
  const m = plano.match(/\b(?:en|de|para)\s+([a-z\s]{3,30})$/)
  if (!m) return null
  const ciudad = m[1].trim()
  // Descarta el caso "clima de hoy" / "clima en este momento": son adverbios
  // de tiempo, no ciudades.
  if (/^(hoy|manana|ahora|este momento|la tarde|la noche|el dia)$/.test(ciudad)) return null
  return ciudad
}
