import CampanaSig from '../../models/CampanaSig.js'
import ProgramacionSig from '../../models/ProgramacionSig.js'
import PreguntaSig from '../../models/PreguntaSig.js'
import { inicioDelDia, instanteLocal } from '../../utils/fechas.js'
import { ErrorNoEncontrado, ErrorConflicto, ErrorValidacion } from '../../utils/errores.js'
import { auditar, obtenerOCrearConfiguracion, normalizarAudiencia } from './comun.js'

const MS_POR_DIA = 24 * 60 * 60 * 1000

// Expansión de fechas de una campaña: aritmética de calendario pura, nunca
// un instante de negocio real (eso lo hace inicioDelDia()/instanteLocal()
// más abajo, una sola vez por fecha ya resuelta). El cursor usa Date.UTC
// solo para leer de vuelta año/mes/día/día-de-semana, sin depender de la
// zona horaria del proceso.
export function calcularFechasCampana(recurrencia, fechaInicioStr, fechaFinStr, fechasExcluidas = []) {
  const excluidas = new Set(fechasExcluidas)

  if (recurrencia?.tipo === 'personalizada') {
    return [...new Set(recurrencia.fechasPersonalizadas || [])]
      .filter((f) => f >= fechaInicioStr && f <= fechaFinStr && !excluidas.has(f))
      .sort()
  }

  const [yi, mi, di] = fechaInicioStr.split('-').map(Number)
  const [yf, mf, df] = fechaFinStr.split('-').map(Number)
  let cursor = Date.UTC(yi, mi - 1, di)
  const fin = Date.UTC(yf, mf - 1, df)

  const fechas = []
  while (cursor <= fin) {
    const d = new Date(cursor)
    const diaStr = d.toISOString().slice(0, 10)
    const incluir =
      recurrencia?.tipo === 'diaria' ||
      (recurrencia?.tipo === 'dias_semana' && recurrencia.diasSemana?.includes(d.getUTCDay()))
    if (incluir && !excluidas.has(diaStr)) fechas.push(diaStr)
    cursor += MS_POR_DIA
  }
  return fechas
}

// Reparte el pool de preguntas entre las fechas calculadas. 'aleatoria' evita
// repetir la misma pregunta en dos fechas consecutivas cuando el pool tiene
// más de una — 'manual' usa esta misma asignación secuencial solo como punto
// de partida para que el admin la reordene en la previsualización.
function asignarPreguntas(fechas, preguntaIds, modoAsignacion) {
  if (modoAsignacion === 'aleatoria') {
    const resultado = []
    let anterior = null
    for (let i = 0; i < fechas.length; i++) {
      const candidatos = preguntaIds.length > 1 && anterior !== null
        ? preguntaIds.filter((p) => String(p) !== String(anterior))
        : preguntaIds
      const elegido = candidatos[Math.floor(Math.random() * candidatos.length)]
      resultado.push(elegido)
      anterior = elegido
    }
    return resultado
  }
  return fechas.map((_, i) => preguntaIds[i % preguntaIds.length])
}

// Calcula la agenda de una campaña SIN persistir nada — usado por
// POST /campanas/previsualizar y, con modoAsignacion distinto de 'manual',
// también internamente por crearCampana().
export async function previsualizarCampana(datos) {
  const { preguntas, recurrencia, fechaInicio, fechaFin, fechasExcluidas, horaPublicacion, modoAsignacion } = datos

  if (!Array.isArray(preguntas) || !preguntas.length) throw new ErrorValidacion('Selecciona al menos una pregunta')
  if (!fechaInicio || !fechaFin) throw new ErrorValidacion('Debes indicar fecha de inicio y de fin')
  if (fechaFin < fechaInicio) throw new ErrorValidacion('La fecha de fin no puede ser anterior a la de inicio')
  if (!recurrencia?.tipo) throw new ErrorValidacion('Debes indicar la frecuencia de la campaña')

  const fechas = calcularFechasCampana(recurrencia, fechaInicio, fechaFin, fechasExcluidas)
  if (!fechas.length) throw new ErrorValidacion('Esa combinación de frecuencia y fechas no genera ninguna publicación')

  const preguntasDocs = await PreguntaSig.find({ _id: { $in: preguntas }, estado: 'activa' }).select('enunciado componenteSig')
  const preguntasPorId = new Map(preguntasDocs.map((p) => [String(p._id), p]))
  const idsValidos = preguntas.map(String).filter((id) => preguntasPorId.has(id))
  if (!idsValidos.length) throw new ErrorValidacion('Ninguna de las preguntas seleccionadas está activa en el banco')

  const config = await obtenerOCrearConfiguracion()
  const hora = horaPublicacion?.trim() || config.horaPublicacionDefecto
  const asignacion = asignarPreguntas(fechas, idsValidos, modoAsignacion)

  return fechas.map((fecha, i) => {
    const pregunta = preguntasPorId.get(String(asignacion[i]))
    return {
      fecha,
      hora,
      preguntaId: String(asignacion[i]),
      enunciado: pregunta?.enunciado,
      componenteSig: pregunta?.componenteSig,
    }
  })
}

export async function crearCampana(datos, usuarioActor) {
  const { nombre, descripcion, recurrencia, fechaInicio, fechaFin, fechasExcluidas, horaPublicacion, modoAsignacion, audiencia, asignacionManual } = datos

  if (!nombre?.trim()) throw new ErrorValidacion('El nombre de la campaña es obligatorio')

  // Modo manual: el admin ya editó fila por fila la asignación devuelta por
  // /campanas/previsualizar, así que se usa tal cual en vez de recalcularla.
  let filas
  if (modoAsignacion === 'manual') {
    if (!Array.isArray(asignacionManual) || !asignacionManual.length) {
      throw new ErrorValidacion('Debes indicar qué pregunta corresponde a cada fecha')
    }
    filas = asignacionManual.map((f) => ({ fecha: f.fecha, preguntaId: String(f.preguntaId), hora: f.hora }))
  } else {
    filas = await previsualizarCampana(datos)
  }

  const config = await obtenerOCrearConfiguracion()
  const hora = horaPublicacion?.trim() || config.horaPublicacionDefecto
  const fechaInicioDate = inicioDelDia(fechaInicio)
  const fechaFinDate = inicioDelDia(fechaFin)
  if (!fechaInicioDate || !fechaFinDate) throw new ErrorValidacion('Fecha de inicio o de fin inválida')

  const audienciaFinal = normalizarAudiencia(audiencia)

  const campana = await CampanaSig.create({
    nombre: nombre.trim(),
    descripcion: descripcion?.trim() || '',
    preguntas: [...new Set(filas.map((f) => f.preguntaId))],
    modoAsignacion,
    recurrencia,
    fechaInicio: fechaInicioDate,
    fechaFin: fechaFinDate,
    fechasExcluidas: fechasExcluidas || [],
    horaPublicacion: hora,
    audiencia: audienciaFinal,
    totalProgramaciones: filas.length,
    creadoPor: usuarioActor.id_usuario,
  })

  const documentos = filas.map((f) => ({
    campana: campana._id,
    pregunta: f.preguntaId,
    fechaProgramada: inicioDelDia(f.fecha),
    fechaHoraPublicacion: instanteLocal(`${f.fecha}T${f.hora || hora}`),
    audiencia: audienciaFinal,
    creadoPor: usuarioActor.id_usuario,
  }))

  try {
    await ProgramacionSig.insertMany(documentos, { ordered: false })
  } catch (err) {
    // El índice único {campana, fechaProgramada} no debería dispararse en una
    // campaña recién creada (las fechas son únicas por construcción); se deja
    // documentado por si el proceso se reintentara con la misma campana._id.
    if (err.code !== 11000) throw err
  }

  await auditar(
    usuarioActor,
    'crear_campana',
    'CampanaSig',
    campana._id,
    `Creó la campaña "${campana.nombre}" con ${filas.length} preguntas programadas (${filas[0]?.fecha} a ${filas[filas.length - 1]?.fecha})`
  )

  return campana
}

export async function listarCampanas() {
  return CampanaSig.find({}).sort({ createdAt: -1 })
}

export async function obtenerCampana(id) {
  const campana = await CampanaSig.findById(id)
  if (!campana) throw new ErrorNoEncontrado('Campaña no encontrada')
  const programaciones = await ProgramacionSig.find({ campana: campana._id })
    .sort({ fechaProgramada: 1 })
    .populate('pregunta', 'enunciado componenteSig')
  return { campana, programaciones }
}

export async function pausarCampana(id, usuarioActor) {
  const campana = await CampanaSig.findById(id)
  if (!campana) throw new ErrorNoEncontrado('Campaña no encontrada')
  if (campana.estado !== 'activa') throw new ErrorConflicto('Solo se puede pausar una campaña activa')

  campana.estado = 'pausada'
  await campana.save()
  await auditar(usuarioActor, 'pausar_campana', 'CampanaSig', campana._id, `Pausó la campaña "${campana.nombre}"`)
  return campana
}

export async function reanudarCampana(id, usuarioActor) {
  const campana = await CampanaSig.findById(id)
  if (!campana) throw new ErrorNoEncontrado('Campaña no encontrada')
  if (campana.estado !== 'pausada') throw new ErrorConflicto('Solo se puede reanudar una campaña pausada')

  campana.estado = 'activa'
  await campana.save()
  await auditar(usuarioActor, 'reanudar_campana', 'CampanaSig', campana._id, `Reanudó la campaña "${campana.nombre}"`)
  return campana
}

// Cancela la campaña y solo sus programaciones FUTURAS (estado 'programada'):
// las ya publicadas y las respuestas que ya se registraron nunca se tocan
// (sección 50 del encargo del módulo — "no alterar retroactivamente").
export async function cancelarCampana(id, motivo, usuarioActor) {
  const campana = await CampanaSig.findById(id)
  if (!campana) throw new ErrorNoEncontrado('Campaña no encontrada')
  if (['finalizada', 'cancelada'].includes(campana.estado)) {
    throw new ErrorConflicto('Esta campaña ya está finalizada o cancelada')
  }

  campana.estado = 'cancelada'
  await campana.save()

  await ProgramacionSig.updateMany(
    { campana: campana._id, estado: 'programada' },
    {
      $set: {
        estado: 'cancelada',
        cancelacion: { canceladaPor: usuarioActor.id_usuario, motivo: motivo?.trim() || 'Campaña cancelada', fecha: new Date() },
      },
    }
  )

  await auditar(usuarioActor, 'cancelar_campana', 'CampanaSig', campana._id, `Canceló la campaña "${campana.nombre}"`)
  return campana
}
