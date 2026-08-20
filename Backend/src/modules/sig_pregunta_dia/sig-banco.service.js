import PreguntaSig from '../../models/PreguntaSig.js'
import ProgramacionSig from '../../models/ProgramacionSig.js'
import { ErrorNoEncontrado, ErrorConflicto, ErrorValidacion } from '../../utils/errores.js'
import { auditar, obtenerOCrearConfiguracion } from './comun.js'

// Mensajes claros en español antes de que el schema los rechace con un error
// más genérico de Mongoose — mismo criterio que el resto de los service del
// proyecto (ver requerimientos.service.js).
function validarOpciones(opciones) {
  if (!Array.isArray(opciones) || opciones.length !== 4) {
    throw new ErrorValidacion('La pregunta debe tener exactamente 4 opciones (A, B, C y D)')
  }
  if (opciones.some((o) => !o?.texto?.trim())) {
    throw new ErrorValidacion('Las 4 opciones deben tener texto')
  }
  if (opciones.filter((o) => o.esCorrecta).length !== 1) {
    throw new ErrorValidacion('Debes marcar exactamente una opción como correcta')
  }
}

async function validarComponente(componenteSig) {
  if (!componenteSig?.trim()) throw new ErrorValidacion('El componente SIG es obligatorio')
  const config = await obtenerOCrearConfiguracion()
  if (!config.componentes.includes(componenteSig)) {
    throw new ErrorValidacion(`"${componenteSig}" no es un componente SIG configurado`)
  }
}

export async function crearPregunta(datos, usuarioActor) {
  const { enunciado, opciones, componenteSig, tema, retroalimentacion, etiquetas } = datos

  if (!enunciado?.trim()) throw new ErrorValidacion('El enunciado es obligatorio')
  if (!tema?.trim()) throw new ErrorValidacion('El tema es obligatorio')
  validarOpciones(opciones)
  await validarComponente(componenteSig)

  const doc = await PreguntaSig.create({
    enunciado: enunciado.trim(),
    opciones: opciones.map((o) => ({ texto: o.texto.trim(), esCorrecta: Boolean(o.esCorrecta) })),
    componenteSig,
    tema: tema.trim(),
    retroalimentacion: {
      correcta: retroalimentacion?.correcta?.trim() || '',
      incorrecta: retroalimentacion?.incorrecta?.trim() || '',
    },
    etiquetas: (etiquetas || []).map((t) => t.trim()).filter(Boolean),
    creadoPor: usuarioActor.id_usuario,
  })

  await auditar(usuarioActor, 'crear', 'PreguntaSig', doc._id, `Creó la pregunta "${doc.enunciado.slice(0, 60)}"`)
  return doc
}

export async function listarBanco({ estado, componenteSig, tema, texto, etiqueta } = {}) {
  const filtro = {}
  if (estado) filtro.estado = estado
  if (componenteSig) filtro.componenteSig = componenteSig
  if (tema) filtro.tema = tema
  if (etiqueta) filtro.etiquetas = etiqueta
  if (texto?.trim()) filtro.$text = { $search: texto.trim() }

  return PreguntaSig.find(filtro).sort({ createdAt: -1 })
}

export async function obtenerPregunta(id) {
  const doc = await PreguntaSig.findById(id)
  if (!doc) throw new ErrorNoEncontrado('Pregunta no encontrada')
  return doc
}

export async function editarPregunta(id, datos, usuarioActor) {
  const doc = await obtenerPregunta(id)

  const { enunciado, opciones, componenteSig, tema, retroalimentacion, etiquetas } = datos
  if (enunciado !== undefined) {
    if (!enunciado?.trim()) throw new ErrorValidacion('El enunciado es obligatorio')
    doc.enunciado = enunciado.trim()
  }
  if (opciones !== undefined) {
    validarOpciones(opciones)
    doc.opciones = opciones.map((o) => ({ texto: o.texto.trim(), esCorrecta: Boolean(o.esCorrecta) }))
  }
  if (componenteSig !== undefined) {
    await validarComponente(componenteSig)
    doc.componenteSig = componenteSig
  }
  if (tema !== undefined) {
    if (!tema?.trim()) throw new ErrorValidacion('El tema es obligatorio')
    doc.tema = tema.trim()
  }
  if (retroalimentacion !== undefined) {
    doc.retroalimentacion = {
      correcta: retroalimentacion?.correcta?.trim() || '',
      incorrecta: retroalimentacion?.incorrecta?.trim() || '',
    }
  }
  if (etiquetas !== undefined) {
    doc.etiquetas = (etiquetas || []).map((t) => t.trim()).filter(Boolean)
  }

  doc.actualizadoPor = usuarioActor.id_usuario
  await doc.save()

  await auditar(usuarioActor, 'editar', 'PreguntaSig', doc._id, `Editó la pregunta "${doc.enunciado.slice(0, 60)}"`)
  return doc
}

export async function archivarPregunta(id, archivar, usuarioActor) {
  const doc = await obtenerPregunta(id)
  doc.estado = archivar ? 'archivada' : 'activa'
  doc.actualizadoPor = usuarioActor.id_usuario
  await doc.save()

  await auditar(
    usuarioActor,
    archivar ? 'archivar' : 'reactivar',
    'PreguntaSig',
    doc._id,
    `${archivar ? 'Archivó' : 'Reactivó'} la pregunta "${doc.enunciado.slice(0, 60)}"`
  )
  return doc
}

// Nunca se hace hard-delete de una pregunta que ya apareció en alguna
// programación (publicada o no): borrarla rompería la trazabilidad del
// calendario y de cualquier ProgramacionSig que aún no se haya publicado
// (su snapshotPregunta se congela recién AL publicar, así que hasta ese
// momento sigue dependiendo de este documento). Archivar es el mecanismo
// correcto para "retirar del banco" en ese caso.
export async function eliminarPregunta(id, usuarioActor) {
  const doc = await obtenerPregunta(id)

  const enUso = await ProgramacionSig.exists({ pregunta: doc._id })
  if (enUso) {
    throw new ErrorConflicto('Esta pregunta ya se usó en una programación y no se puede eliminar. Archívala en su lugar.')
  }

  await doc.deleteOne()
  await auditar(usuarioActor, 'eliminar', 'PreguntaSig', doc._id, `Eliminó la pregunta "${doc.enunciado.slice(0, 60)}"`)
  return { eliminado: true }
}
