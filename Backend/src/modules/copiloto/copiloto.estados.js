// Estados del flujo conversacional del copiloto.
//
// Esto NO reemplaza el historial de turnos (copiloto.memoria.js) ni el
// razonamiento del modelo: es una etiqueta barata, calculada en el servidor a
// partir de lo que YA pasó en el turno, que resume "en qué punto de una tarea
// está esta conversación" para que:
//   1. El prompt se lo pueda recordar al modelo en una línea, en vez de que el
//      modelo tenga que releer 8 turnos de prosa para reconstruirlo.
//   2. Un "sí", "urgente" o "también" suelto tenga un sitio inequívoco donde
//      aterrizar (la última pregunta / el borrador activo) en vez de quedar
//      como un mensaje sin contexto.
export const ESTADOS = Object.freeze({
  IDLE: 'IDLE',
  CREATING: 'CREATING',
  EDITING: 'EDITING',
  ASKING: 'ASKING',
  WAITING_USER_RESPONSE: 'WAITING_USER_RESPONSE',
  CONFIRMING: 'CONFIRMING',
  COMPLETED: 'COMPLETED',
})

export const ESTADO_INICIAL = Object.freeze({
  flujo: ESTADOS.IDLE,
  entidadActiva: null,
  ultimaPregunta: null,
  borrador: null,
})
