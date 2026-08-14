import Empleado, { TIPOS_DOCUMENTO } from '../../models/Empleado.js'
import Usuario from '../../models/Usuario.js'
import Cargo from '../../models/Cargo.js'
import Dependencia from '../../models/Dependencia.js'
import { ErrorNoEncontrado, ErrorValidacion, ErrorConflicto } from '../../utils/errores.js'
import { registrarAuditoria } from '../../utils/auditoria.js'

const POPULATE_EMPLEADO = [
  { path: 'usuario', select: 'nombre nombre_usuario email estado' },
  { path: 'cargo', select: 'nombre' },
  { path: 'dependencia', select: 'nombre' },
]

function auditar(usuarioActor, accion, doc, descripcion, cambios) {
  return registrarAuditoria({
    usuario: usuarioActor,
    accion,
    modulo: 'empleados',
    entidad: 'Empleado',
    entidadId: doc._id,
    descripcion,
    cambios,
  })
}

// Valida que cargo/dependencia, si vienen, existan de verdad. No exige que
// vengan: un empleado puede quedar sin asignar todavía (ver Empleado.js).
async function validarReferencias({ cargo, dependencia }) {
  if (cargo && !(await Cargo.exists({ _id: cargo }))) {
    throw new ErrorValidacion('El cargo indicado no existe')
  }
  if (dependencia && !(await Dependencia.exists({ _id: dependencia }))) {
    throw new ErrorValidacion('La dependencia indicada no existe')
  }
}

export async function listarEmpleados({ estado } = {}) {
  const filtro = {}
  if (estado) filtro.estado = estado
  return Empleado.find(filtro).sort({ createdAt: -1 }).populate(POPULATE_EMPLEADO)
}

export async function obtenerEmpleado(id) {
  const empleado = await Empleado.findById(id).populate(POPULATE_EMPLEADO)
  if (!empleado) throw new ErrorNoEncontrado('Empleado no encontrado')
  return empleado
}

// Usuarios que todavía no tienen expediente de Empleado — lo que alimenta el
// select de "crear empleado" (no tiene sentido ofrecer un Usuario que ya es
// Empleado, la relación es 1:1).
export async function listarUsuariosDisponibles() {
  const idsConEmpleado = await Empleado.distinct('usuario')
  return Usuario.find({ _id: { $nin: idsConEmpleado }, estado: 'activo' })
    .select('nombre nombre_usuario email')
    .sort({ nombre: 1 })
}

export async function crearEmpleado(datos, usuarioActor) {
  const { usuario, numeroDocumento, tipoDocumento, telefono, cargo, dependencia, fechaIngreso } = datos || {}

  if (!usuario) throw new ErrorValidacion('usuario es obligatorio')
  if (!(await Usuario.exists({ _id: usuario }))) throw new ErrorValidacion('El usuario indicado no existe')
  if (await Empleado.exists({ usuario })) {
    throw new ErrorConflicto('Ese usuario ya tiene un expediente de empleado (la relación es 1:1)')
  }

  if (!numeroDocumento?.trim()) throw new ErrorValidacion('numeroDocumento es obligatorio')
  if (tipoDocumento && !TIPOS_DOCUMENTO.includes(tipoDocumento)) {
    throw new ErrorValidacion(`tipoDocumento debe ser uno de: ${TIPOS_DOCUMENTO.join(', ')}`)
  }
  if (await Empleado.exists({ numeroDocumento: numeroDocumento.trim() })) {
    throw new ErrorConflicto('Ya existe un empleado con ese número de documento')
  }

  const fecha = fechaIngreso ? new Date(fechaIngreso) : null
  if (!fecha || Number.isNaN(fecha.getTime())) {
    throw new ErrorValidacion('fechaIngreso es obligatoria y debe ser una fecha válida')
  }

  await validarReferencias({ cargo, dependencia })

  const empleado = await Empleado.create({
    usuario,
    numeroDocumento: numeroDocumento.trim(),
    tipoDocumento: tipoDocumento || 'CC',
    telefono: telefono?.trim() || '',
    cargo: cargo || null,
    dependencia: dependencia || null,
    fechaIngreso: fecha,
  })

  await auditar(usuarioActor, 'crear', empleado, `Empleado creado: ${numeroDocumento}`, { antes: null, despues: empleado.toObject() })

  return obtenerEmpleado(empleado._id)
}

export async function actualizarEmpleado(id, datos, usuarioActor) {
  const empleado = await Empleado.findById(id)
  if (!empleado) throw new ErrorNoEncontrado('Empleado no encontrado')

  // El vínculo con Usuario es 1:1 fijo desde la creación (ver Empleado.js):
  // cambiarlo después equivaldría a "convertir" a otra persona en este
  // expediente, que no es una operación que este endpoint deba permitir.
  if (datos.usuario !== undefined && String(datos.usuario) !== String(empleado.usuario)) {
    throw new ErrorConflicto('No se puede cambiar el usuario vinculado a un empleado ya creado')
  }

  const { numeroDocumento, tipoDocumento, telefono, cargo, dependencia, fechaIngreso } = datos

  if (numeroDocumento !== undefined) {
    if (!numeroDocumento?.trim()) throw new ErrorValidacion('numeroDocumento no puede quedar vacío')
    const duplicado = await Empleado.exists({ numeroDocumento: numeroDocumento.trim(), _id: { $ne: id } })
    if (duplicado) throw new ErrorConflicto('Ya existe un empleado con ese número de documento')
  }
  if (tipoDocumento !== undefined && !TIPOS_DOCUMENTO.includes(tipoDocumento)) {
    throw new ErrorValidacion(`tipoDocumento debe ser uno de: ${TIPOS_DOCUMENTO.join(', ')}`)
  }

  await validarReferencias({ cargo, dependencia })

  const antes = empleado.toObject()

  if (numeroDocumento !== undefined) empleado.numeroDocumento = numeroDocumento.trim()
  if (tipoDocumento !== undefined) empleado.tipoDocumento = tipoDocumento
  if (telefono !== undefined) empleado.telefono = telefono?.trim() || ''
  if (cargo !== undefined) empleado.cargo = cargo || null
  if (dependencia !== undefined) empleado.dependencia = dependencia || null
  if (fechaIngreso !== undefined) {
    const fecha = new Date(fechaIngreso)
    if (Number.isNaN(fecha.getTime())) throw new ErrorValidacion('fechaIngreso debe ser una fecha válida')
    empleado.fechaIngreso = fecha
  }

  await empleado.save()
  await auditar(usuarioActor, 'actualizar', empleado, `Empleado actualizado: ${empleado.numeroDocumento}`, {
    antes,
    despues: empleado.toObject(),
  })

  return obtenerEmpleado(id)
}

export async function desvincularEmpleado(id, motivo, usuarioActor) {
  const empleado = await Empleado.findById(id)
  if (!empleado) throw new ErrorNoEncontrado('Empleado no encontrado')
  if (empleado.estado === 'inactivo') throw new ErrorConflicto('Este empleado ya está desvinculado')

  const antes = empleado.toObject()
  empleado.estado = 'inactivo'
  empleado.fechaDesvinculacion = new Date()
  empleado.motivoDesvinculacion = motivo?.trim() || ''
  await empleado.save()

  await auditar(usuarioActor, 'actualizar', empleado, `Empleado desvinculado: ${empleado.numeroDocumento}`, {
    antes,
    despues: empleado.toObject(),
  })

  return obtenerEmpleado(id)
}

export async function reactivarEmpleado(id, usuarioActor) {
  const empleado = await Empleado.findById(id)
  if (!empleado) throw new ErrorNoEncontrado('Empleado no encontrado')
  if (empleado.estado === 'activo') throw new ErrorConflicto('Este empleado ya está activo')

  const antes = empleado.toObject()
  empleado.estado = 'activo'
  empleado.fechaDesvinculacion = null
  empleado.motivoDesvinculacion = ''
  await empleado.save()

  await auditar(usuarioActor, 'actualizar', empleado, `Empleado reactivado: ${empleado.numeroDocumento}`, {
    antes,
    despues: empleado.toObject(),
  })

  return obtenerEmpleado(id)
}
