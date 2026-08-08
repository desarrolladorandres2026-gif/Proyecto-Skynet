// Redacción de las respuestas que NO pasan por el modelo (ver
// copiloto.intencion.js). Son texto plano a propósito: casi siempre terminan
// leídas en voz alta por el sintetizador del navegador, que pronunciaría los
// asteriscos del Markdown (por eso useHablar.js tiene que limpiarlos de lo
// que sí escribe el modelo).
//
// Reglas de redacción, para que no suenen a plantilla:
//  - La cifra va al PRINCIPIO. Quien pregunta "¿qué tengo pendiente?" quiere
//    el número, no una introducción antes del número.
//  - Nada de "He consultado tus requerimientos y he encontrado que...". Se
//    responde como contestaría un compañero de trabajo.
//  - El caso vacío no es un error, es una buena noticia, y se dice así.

// Escoge una variante al azar. Solo se usa en la cortesía: repetir literal el
// mismo "¡Hola!" en cada saludo es lo que hace que un asistente suene a
// máquina. Las respuestas con datos NO varían — ahí la consistencia importa
// más que la naturalidad.
function unaDe(opciones) {
  return opciones[Math.floor(Math.random() * opciones.length)]
}

// Concuerda singular/plural sin tener que escribir dos plantillas.
function plural(n, singular, plural_) {
  return n === 1 ? singular : plural_
}

export function saludo(nombre) {
  const corto = String(nombre || '').split(' ')[0]
  return unaDe([
    `Hola${corto ? ` ${corto}` : ''}. ¿En qué te ayudo?`,
    `¿Qué necesitas${corto ? `, ${corto}` : ''}?`,
    `Aquí estoy. Dime.`,
    `Hola. ¿Qué miramos hoy?`,
  ])
}

export function agradecimiento() {
  return unaDe(['Con gusto.', 'Para eso estoy.', 'Cuando quieras.', 'Listo, cualquier cosa me dices.'])
}

export function despedida() {
  return unaDe(['Hasta luego.', 'Que te vaya bien.', 'Nos hablamos.'])
}

export function sinContenido() {
  return unaDe(['Te escucho.', 'Dime.', 'Aquí estoy, ¿qué necesitas?'])
}

// ── Resumen del tablero ─────────────────────────────────────────────────────
// `tarjetas` es el objeto que arma calcularResumen(): claves distintas según
// el rol y los módulos activos, así que se recorre por lo que VENGA en vez de
// asumir un conjunto fijo. Las claves que no son conteos de trabajo pendiente
// (usuarios activos, por ejemplo) se omiten: la pregunta es "qué tengo que
// hacer", no "cuántos registros hay".
const ETIQUETA_TARJETA = {
  danosPendientes: ['daño sin resolver', 'daños sin resolver'],
  misDanosReportados: ['daño que reportaste', 'daños que reportaste'],
  requerimientosPendientes: ['requerimiento por aprobar', 'requerimientos por aprobar'],
  requerimientosPorDespachar: ['requerimiento por despachar', 'requerimientos por despachar'],
  misRequerimientos: ['requerimiento tuyo en curso', 'requerimientos tuyos en curso'],
  ausenciasPendientes: ['solicitud de ausencia por revisar', 'solicitudes de ausencia por revisar'],
  misAusencias: ['solicitud de ausencia tuya', 'solicitudes de ausencia tuyas'],
  mantenimientoAbiertas: ['orden de mantenimiento abierta', 'órdenes de mantenimiento abiertas'],
}

export function resumenTablero(tarjetas) {
  const partes = []
  for (const [clave, etiquetas] of Object.entries(ETIQUETA_TARJETA)) {
    const n = tarjetas?.[clave]
    if (typeof n !== 'number' || n === 0) continue
    partes.push(`${n} ${plural(n, etiquetas[0], etiquetas[1])}`)
  }

  if (!partes.length) return 'No tienes nada pendiente por ahora. Todo al día.'
  if (partes.length === 1) return `Tienes ${partes[0]}.`
  const ultima = partes.pop()
  return `Tienes ${partes.join(', ')} y ${ultima}.`
}

// ── Requerimientos ──────────────────────────────────────────────────────────
const ESTADO_REQUERIMIENTO_HUMANO = {
  pendiente_financiero: 'esperando aprobación de Financiero',
  pendiente_bodega: 'en Bodega',
  rechazado: 'rechazado',
}

export function listaRequerimientos(lista, estadoFiltrado) {
  if (!lista.length) {
    return estadoFiltrado
      ? `No tienes requerimientos ${ESTADO_REQUERIMIENTO_HUMANO[estadoFiltrado] || estadoFiltrado}.`
      : 'No tienes requerimientos registrados.'
  }

  const n = lista.length
  // Con filtro explícito el estado ya es la pregunta: no hace falta repetirlo
  // en cada línea, basta el conteo y de qué son.
  if (estadoFiltrado) {
    const cabecera = `Tienes ${n} ${plural(n, 'requerimiento', 'requerimientos')} ${ESTADO_REQUERIMIENTO_HUMANO[estadoFiltrado] || estadoFiltrado}`
    return `${cabecera}: ${lista.map(describirRequerimiento).join('; ')}.`
  }

  // Sin filtro: lo útil es el desglose por estado, no la lista cruda.
  const porEstado = new Map()
  for (const r of lista) porEstado.set(r.estado, (porEstado.get(r.estado) || 0) + 1)
  const desglose = [...porEstado.entries()].map(
    ([estado, cuenta]) => `${cuenta} ${ESTADO_REQUERIMIENTO_HUMANO[estado] || estado}`
  )
  const ultima = desglose.pop()
  const cuerpo = desglose.length ? `${desglose.join(', ')} y ${ultima}` : ultima
  return `Tienes ${n} ${plural(n, 'requerimiento', 'requerimientos')} en total: ${cuerpo}.`
}

function describirRequerimiento(r) {
  const que = r.tipo === 'servicio' ? 'servicio' : 'compra'
  const area = r.areaOProceso ? ` de ${r.areaOProceso}` : ''
  return `uno de ${que}${area}`
}

// ── Ausencias ───────────────────────────────────────────────────────────────
const TIPO_AUSENCIA_HUMANO = {
  vacaciones: 'vacaciones',
  permiso_remunerado: 'permiso remunerado',
  permiso_no_remunerado: 'permiso no remunerado',
  incapacidad: 'incapacidad',
}
const ESTADO_AUSENCIA_HUMANO = {
  pendiente: 'sin responder todavía',
  aprobada: 'aprobada',
  rechazada: 'rechazada',
  cancelada: 'cancelada',
}

export function listaAusencias(lista, estadoFiltrado) {
  if (!lista.length) {
    return estadoFiltrado
      ? `No tienes solicitudes ${ESTADO_AUSENCIA_HUMANO[estadoFiltrado] || estadoFiltrado}.`
      : 'No tienes solicitudes de ausencia registradas.'
  }

  // Es la consulta donde el detalle sí importa: quien pregunta por sus
  // vacaciones quiere saber CUÁLES y desde cuándo, no un conteo.
  const detalle = lista.slice(0, 4).map((a) => {
    const tipo = TIPO_AUSENCIA_HUMANO[a.tipo] || a.tipo
    const estado = ESTADO_AUSENCIA_HUMANO[a.estado] || a.estado
    return `${tipo} del ${fechaCorta(a.fechaInicio)} al ${fechaCorta(a.fechaFin)}, ${estado}`
  })
  const resto = lista.length - detalle.length
  const cola = resto > 0 ? ` Y ${resto} ${plural(resto, 'más', 'más')}.` : ''
  return `${detalle.join('. ')}.${cola}`
}

// ── Daños ───────────────────────────────────────────────────────────────────
const ESTADO_DANO_HUMANO = {
  pendiente: 'sin asignar',
  asignado: 'asignado',
  en_proceso: 'en proceso',
  en_espera: 'en espera',
  resuelto: 'resuelto',
  cancelado: 'cancelado',
}

export function listaDanos(lista) {
  if (!lista.length) return 'No has reportado ningún daño.'

  const abiertos = lista.filter((d) => d.estado !== 'resuelto' && d.estado !== 'cancelado')
  if (!abiertos.length) {
    return `Reportaste ${lista.length} ${plural(lista.length, 'daño', 'daños')} y ya ${plural(lista.length, 'está resuelto', 'están todos resueltos')}.`
  }

  const detalle = abiertos.slice(0, 3).map((d) => {
    const quien = d.asignadoA ? `, con ${d.asignadoA}` : ''
    return `${recortarFrase(d.descripcion)} (${ESTADO_DANO_HUMANO[d.estado] || d.estado}${quien})`
  })
  const resto = abiertos.length - detalle.length
  const cola = resto > 0 ? ` Hay ${resto} más abiertos.` : ''
  return `Tienes ${abiertos.length} ${plural(abiertos.length, 'daño abierto', 'daños abiertos')}: ${detalle.join('; ')}.${cola}`
}

// ── Clima ───────────────────────────────────────────────────────────────────
export function clima(datos) {
  if (datos?.error) return `No pude consultar el clima: ${datos.error}.`
  if (!datos?.encontrado) return datos?.mensaje || 'No encontré esa ciudad.'
  return `En ${datos.ciudad} hay ${Math.round(datos.temperaturaC)} grados, ${datos.condicion}, con ${datos.humedadPorcentaje}% de humedad.`
}

// ── Hora y fecha ────────────────────────────────────────────────────────────
// Se responde la hora "de reloj de pared" y no la técnica: nadie pregunta la
// hora esperando oír la zona IANA ni el desfase UTC. El lugar solo se nombra
// cuando el usuario preguntó por otro sitio — decir "en Bogotá son las 3" a
// quien está en Neiva sobra y suena a que no entendió la pregunta.
export function hora(datos, lugarPedido) {
  if (datos?.error) return datos.error
  if (!datos?.hora) return null
  const donde = lugarPedido ? ` en ${capitalizar(lugarPedido)}` : ''
  return `Son las ${datos.hora}${donde}.`
}

export function fecha(datos, lugarPedido) {
  if (datos?.error) return datos.error
  if (!datos?.fecha) return null
  const donde = lugarPedido ? ` en ${capitalizar(lugarPedido)}` : ''
  return `Hoy es ${datos.fecha}${donde}.`
}

function capitalizar(texto) {
  return String(texto)
    .split(' ')
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(' ')
}

// ── Auxiliares ──────────────────────────────────────────────────────────────
// "15 de marzo" y no "2026-03-15": esto se lee en voz alta.
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function fechaCorta(valor) {
  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return 'fecha sin definir'
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`
}

// Las descripciones de daño son texto libre y pueden ser larguísimas; leídas
// en voz alta completas vuelven insoportable la respuesta.
function recortarFrase(texto, maximo = 60) {
  const limpio = String(texto || '').trim().replace(/\s+/g, ' ')
  if (limpio.length <= maximo) return limpio
  return `${limpio.slice(0, maximo).trimEnd()}…`
}
