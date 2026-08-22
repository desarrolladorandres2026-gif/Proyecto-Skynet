import ProgramacionSig from '../../models/ProgramacionSig.js'
import PreguntaSig from '../../models/PreguntaSig.js'
import CampanaSig from '../../models/CampanaSig.js'
import Usuario from '../../models/Usuario.js'
import { inicioDelDia, instanteLocal, rangoDeDias } from '../../utils/fechas.js'
import { ErrorNoEncontrado, ErrorConflicto, ErrorValidacion } from '../../utils/errores.js'
import { notificarUsuarios as _notificarUsuarios } from '../../utils/sendPush.js'
import { auditar, obtenerOCrearConfiguracion, resolverAudiencia, normalizarAudiencia } from './comun.js'

const notificarUsuarios = (userIds, payload) => _notificarUsuarios(userIds, payload, 'sig_pregunta_dia')

// ── Programación individual ─────────────────────────────────────────────

// El endpoint acepta tres formas de entrada y todas se normalizan a la misma
// lista [{ preguntaId, hora }] antes de tocar nada más:
//
//   { preguntaId }                        una sola pregunta (forma histórica)
//   { preguntaIds: [...] }                varias, todas a la misma hora
//   { preguntas: [{ preguntaId, hora }] } varias, cada una a su propia hora
//
// Así el resto de la función tiene un solo caso que manejar en vez de tres, y
// las llamadas viejas de un solo `preguntaId` siguen funcionando sin cambios.
function normalizarEntradaPreguntas({ preguntaId, preguntaIds, preguntas }) {
  if (Array.isArray(preguntas) && preguntas.length) {
    return preguntas.map((p) => ({ preguntaId: p?.preguntaId, hora: p?.hora }))
  }
  if (Array.isArray(preguntaIds) && preguntaIds.length) {
    return preguntaIds.map((preguntaId) => ({ preguntaId, hora: undefined }))
  }
  return preguntaId ? [{ preguntaId, hora: undefined }] : []
}

// Programa UNA O VARIAS preguntas para un mismo día. Varias preguntas
// distintas el mismo día es exactamente el caso de uso que habilita esta
// función; la MISMA pregunta dos veces el mismo día no lo es — sería la misma
// tarjeta repetida en el Terminal del trabajador, así que se rechaza tanto
// dentro del mismo envío como contra lo que ya estuviera programado ese día.
//
// La validación completa ocurre ANTES de crear nada: o entra el lote entero o
// no entra ninguna. Un lote a medias dejaría al administrador sin saber
// cuáles de sus 5 preguntas quedaron programadas y cuáles no.
export async function crearProgramacionIndividual(datos, usuarioActor) {
  const { fecha, hora, audiencia } = datos

  const items = normalizarEntradaPreguntas(datos)
  if (!items.length) throw new ErrorValidacion('Debes elegir al menos una pregunta')
  if (!fecha) throw new ErrorValidacion('Debes indicar la fecha de publicación')

  const fechaProgramada = inicioDelDia(fecha)
  if (!fechaProgramada) throw new ErrorValidacion('La fecha de publicación no es válida')

  const config = await obtenerOCrearConfiguracion()
  const audienciaNormalizada = normalizarAudiencia(audiencia)

  const vistas = new Set()
  const preparadas = []

  for (const item of items) {
    if (!item.preguntaId) throw new ErrorValidacion('Hay una pregunta sin identificar en la lista')

    const clave = String(item.preguntaId)
    if (vistas.has(clave)) {
      throw new ErrorValidacion('Repetiste una misma pregunta en la lista; elige preguntas distintas')
    }
    vistas.add(clave)

    const pregunta = await PreguntaSig.findById(item.preguntaId)
    if (!pregunta) throw new ErrorNoEncontrado('Pregunta no encontrada')
    if (pregunta.estado !== 'activa') {
      throw new ErrorValidacion(`"${pregunta.enunciado.slice(0, 40)}…" está archivada y no se puede programar`)
    }

    const horaFinal = item.hora?.trim() || hora?.trim() || config.horaPublicacionDefecto
    const fechaHoraPublicacion = instanteLocal(`${fecha}T${horaFinal}`)
    if (!fechaHoraPublicacion) throw new ErrorValidacion(`La hora "${horaFinal}" no es válida`)
    if (fechaHoraPublicacion.getTime() < Date.now() - 60_000) {
      throw new ErrorValidacion('La fecha y hora de publicación deben ser futuras')
    }

    preparadas.push({ pregunta, horaFinal, fechaHoraPublicacion })
  }

  // Choque contra lo que ya está en la agenda de ese día. Se ignoran las
  // canceladas: una programación cancelada libera el cupo de esa pregunta
  // para volver a programarla el mismo día.
  const yaEnEseDia = await ProgramacionSig.find({
    fechaProgramada,
    estado: { $ne: 'cancelada' },
    pregunta: { $in: preparadas.map((p) => p.pregunta._id) },
  }).select('pregunta')

  if (yaEnEseDia.length) {
    const repetida = preparadas.find((p) =>
      yaEnEseDia.some((e) => String(e.pregunta) === String(p.pregunta._id))
    )
    throw new ErrorConflicto(
      `"${repetida.pregunta.enunciado.slice(0, 40)}…" ya está programada para ese día`
    )
  }

  const docs = await ProgramacionSig.insertMany(
    preparadas.map((p) => ({
      pregunta: p.pregunta._id,
      fechaProgramada,
      fechaHoraPublicacion: p.fechaHoraPublicacion,
      audiencia: audienciaNormalizada,
      creadoPor: usuarioActor.id_usuario,
    }))
  )

  await Promise.all(
    docs.map((doc, indice) =>
      auditar(
        usuarioActor,
        'programar',
        'ProgramacionSig',
        doc._id,
        `Programó la pregunta "${preparadas[indice].pregunta.enunciado.slice(0, 60)}" para el ${fecha} a las ${preparadas[indice].horaFinal}`
      )
    )
  )

  return ProgramacionSig.find({ _id: { $in: docs.map((d) => d._id) } })
    .sort({ fechaHoraPublicacion: 1 })
    .populate('pregunta', 'enunciado componenteSig')
}

export async function listarProgramacionesIndividuales({ desde, hasta, estado } = {}) {
  const filtro = { campana: null }
  if (estado) filtro.estado = estado
  if (desde && hasta) filtro.fechaProgramada = rangoDeDias(desde, hasta)

  return ProgramacionSig.find(filtro)
    .sort({ fechaHoraPublicacion: 1 })
    .populate('pregunta', 'enunciado componenteSig')
}

// Para la vista calendario (sección 39 del encargo): TODAS las
// programaciones del rango, individuales o de campaña, con el nombre de la
// campaña si aplica — a diferencia de listarProgramacionesIndividuales() de
// arriba, que a propósito excluye las de campaña (esa es la bandeja de
// "programación individual").
export async function listarProgramacionesCalendario({ desde, hasta }) {
  const filtro = { fechaProgramada: rangoDeDias(desde, hasta) }
  return ProgramacionSig.find(filtro)
    .sort({ fechaHoraPublicacion: 1 })
    .populate('pregunta', 'enunciado componenteSig')
    .populate('campana', 'nombre')
}

export async function cancelarProgramacionIndividual(id, motivo, usuarioActor) {
  const doc = await ProgramacionSig.findById(id)
  if (!doc) throw new ErrorNoEncontrado('Programación no encontrada')
  if (doc.estado !== 'programada') {
    throw new ErrorConflicto('Solo se puede cancelar una programación que aún no se ha publicado')
  }

  doc.estado = 'cancelada'
  doc.cancelacion = { canceladaPor: usuarioActor.id_usuario, motivo: motivo?.trim() || '', fecha: new Date() }
  await doc.save()

  await auditar(usuarioActor, 'cancelar_programacion', 'ProgramacionSig', doc._id, 'Canceló una programación antes de publicarse')
  return doc
}

// ── Motor de publicación automática (usado por sig.worker.js) ──────────────

// El worker no tiene un "actor sistema": RegistroAuditoria.usuario es un ref
// obligatorio a un Usuario real. Se atribuye la publicación automática a
// quien programó la pregunta/campaña — sí originó la acción, el sistema solo
// ejecutó el "cuándo".
async function actorDesdeCreador(creadoPorId) {
  const creador = await Usuario.findById(creadoPorId).select('nombre_usuario rol').populate('rol', 'slug')
  return {
    id_usuario: creadoPorId,
    nombre_usuario: creador?.nombre_usuario || 'usuario eliminado',
    rol: { slug: creador?.rol?.slug },
  }
}

// Un solo push por audiencia y por tick, no uno por pregunta: desde que se
// pueden programar varias preguntas para el mismo día a la misma hora, avisar
// por cada una haría sonar el teléfono del trabajador 4 veces seguidas para
// decirle lo mismo. Se agrupan por audiencia (dos publicaciones dirigidas a
// áreas distintas sí son dos avisos distintos, cada uno a su gente) y el
// texto se ajusta al plural cuando hay más de una.
async function avisarPublicaciones(docs) {
  if (!docs.length) return
  const config = await obtenerOCrearConfiguracion()
  if (!config.notificarAlPublicar) return

  const grupos = new Map()
  for (const doc of docs) {
    const audiencia = doc.audiencia || { todos: true }
    const clave = audiencia.todos
      ? 'todos'
      : `dirigida:${[...(audiencia.dependencias || [])].sort().join('|')}::${[...(audiencia.cargos || [])].sort().join('|')}`
    const grupo = grupos.get(clave) || { audiencia, componentes: new Set(), total: 0 }
    grupo.componentes.add(doc.snapshotPregunta.componenteSig)
    grupo.total += 1
    grupos.set(clave, grupo)
  }

  for (const grupo of grupos.values()) {
    try {
      const destinatarios = await resolverAudiencia(grupo.audiencia)
      if (!destinatarios.length) {
        // Silencioso hasta ahora: una audiencia dirigida (dependencia/cargo)
        // que no matchea a ningún usuario real publica igual, sin que nadie
        // se entere de que se quedó sin destinatarios. Ver auditoría
        // 2026-08-22.
        console.warn('Publicación SIG sin destinatarios reales para la audiencia:', JSON.stringify(grupo.audiencia))
        continue
      }

      const componentes = [...grupo.componentes].join(', ')
      await notificarUsuarios(destinatarios, {
        title: '🧠 Nuevo Cuestionario Programado',
        body:
          grupo.total === 1
            ? `Ya está disponible tu pregunta de capacitación de hoy. Componente: ${componentes}`
            : `Ya tienes ${grupo.total} preguntas de capacitación para hoy. Componentes: ${componentes}`,
        url: '/sig/pregunta-del-dia',
      })
    } catch (err) {
      // Un grupo de audiencia fallando (p. ej. un blip resolviendo
      // destinatarios) no debe dejar sin aviso a los demás grupos de esta
      // misma tanda de publicaciones.
      console.error('No se pudo notificar un grupo de publicaciones SIG:', err.message)
    }
  }
}

// Publica cada ProgramacionSig cuya fechaHoraPublicacion ya llegó. El
// findOneAndUpdate con filtro {_id, estado:'programada'} es un
// compare-and-swap atómico a nivel de Mongo: si dos ticks (o dos instancias
// del proceso) compiten por la misma candidata, solo uno obtiene un
// resultado no-null y solo ese notifica/audita — un tick duplicado nunca
// publica ni notifica dos veces.
export async function publicarPendientes(lote = 200) {
  const ahora = new Date()
  const candidatas = await ProgramacionSig.find({ estado: 'programada', fechaHoraPublicacion: { $lte: ahora } })
    .limit(lote)
    .select('_id pregunta audiencia creadoPor campana')

  const publicadas = []
  for (const candidata of candidatas) {
    // Try/catch por candidata: sin él, una excepción a mitad del lote (un
    // blip transitorio de Mongo, p. ej.) escapaba del for ANTES de llegar a
    // avisarPublicaciones() de abajo — perdiendo el aviso de TODAS las
    // candidatas que ya habían ganado su CAS en este mismo tick, aunque ya
    // hubieran quedado marcadas 'publicada' (y por lo tanto el siguiente
    // tick nunca las vuelve a considerar: quedaban huérfanas para siempre).
    // Ver auditoría 2026-08-22.
    try {
      // Una programación que pertenece a una campaña PAUSADA o CANCELADA se
      // salta sin tocarla (sigue en 'programada'): si la campaña se reanuda
      // más adelante, el siguiente tick la publica normalmente. Cancelar la
      // campaña sí marca sus programaciones futuras como 'cancelada' de una
      // vez (ver sig-campanas.service.js#cancelarCampana), así que en la
      // práctica este chequeo solo importa para el caso "pausada".
      if (candidata.campana) {
        const campana = await CampanaSig.findById(candidata.campana).select('estado')
        if (!campana || campana.estado !== 'activa') continue
      }

      const pregunta = await PreguntaSig.findById(candidata.pregunta)
      // Defensivo: sig-banco.service.js impide borrar una pregunta ya usada en
      // una programación, así que esto no debería pasar en operación normal.
      if (!pregunta) continue

      const snapshotPregunta = {
        enunciado: pregunta.enunciado,
        opciones: pregunta.opciones.map((o) => ({ texto: o.texto, esCorrecta: o.esCorrecta })),
        componenteSig: pregunta.componenteSig,
        tema: pregunta.tema,
      }

      const publicada = await ProgramacionSig.findOneAndUpdate(
        { _id: candidata._id, estado: 'programada' },
        { $set: { estado: 'publicada', publicadaEn: new Date(), snapshotPregunta } },
        { new: true }
      )
      if (!publicada) continue // otro tick/instancia ya ganó la carrera

      // Se guarda ANTES de auditar a propósito: la auditoría es best-effort
      // (ver el try/catch interno de abajo) y no debe poner en riesgo la
      // notificación de algo que YA quedó marcado 'publicada'.
      publicadas.push(publicada)

      try {
        const actor = await actorDesdeCreador(publicada.creadoPor)
        await auditar(
          actor,
          'publicar_automatico',
          'ProgramacionSig',
          publicada._id,
          `Publicación automática a la hora programada: "${snapshotPregunta.enunciado.slice(0, 60)}"`
        )
      } catch (err) {
        console.error(`No se pudo auditar la publicación automática de "${publicada._id}":`, err.message)
      }
    } catch (err) {
      // Esta candidata no llegó a publicarse (o falló antes del CAS): sigue
      // en 'programada' y el siguiente tick la vuelve a intentar sola. Lo
      // importante es que el resto del lote (y avisarPublicaciones de abajo)
      // sigan su curso.
      console.error(`Fallo publicando la programación "${candidata._id}", se reintentará en el siguiente tick:`, err.message)
    }
  }

  // Fuera del bucle a propósito: ver avisarPublicaciones().
  await avisarPublicaciones(publicadas)

  return publicadas.length
}
