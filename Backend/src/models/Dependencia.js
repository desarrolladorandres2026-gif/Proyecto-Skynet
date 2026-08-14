import mongoose from 'mongoose'

const dependenciaSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, unique: true, trim: true },
    // Jerarquía organizacional (Talento Humano Fase 1). Opcional: la mayoría
    // de dependencias del catálogo actual son planas (creadas antes de que
    // existiera este concepto) y no todas necesitan un padre. Ver
    // docs/arquitectura/01-talento-humano.md — el nombre se fijó como
    // "Dependencia" (no "Departamento") para no chocar con "Área" si algún
    // día existe en el dominio de Activos/Infraestructura.
    padre: { type: mongoose.Schema.Types.ObjectId, ref: 'Dependencia', default: null, index: true },
    // Quien aprueba, por relación organizacional, las solicitudes (p. ej.
    // Ausencia) del personal de esta dependencia. Ref a Empleado, no a
    // Usuario: es un hecho de la estructura laboral, no de la cuenta de
    // acceso. Opcional: una dependencia puede no tener jefe asignado aún.
    jefe: { type: mongoose.Schema.Types.ObjectId, ref: 'Empleado', default: null },
  },
  { timestamps: true }
)

export default mongoose.model('Dependencia', dependenciaSchema)
