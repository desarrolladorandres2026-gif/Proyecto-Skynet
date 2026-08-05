import mongoose from 'mongoose'

const rolSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true },
    descripcion: { type: String, trim: true },
    // Bypass total de requierePermiso(): evita mantener un permiso "acceso a
    // todos los módulos" sincronizado a mano con cada módulo nuevo del ERP.
    esSuperAdmin: { type: Boolean, default: false },
    permisos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Permiso' }],
    // Solo 'global' desde que se retiró el módulo flota/Empresa: el scoping
    // multi-tenant ambito:'empresa' (Usuario.empresa, cargarScopeEmpresa())
    // no tiene ya ningún dato al cual restringir. El campo se conserva
    // (en vez de borrarlo) porque middleware/permisos.js todavía lo lee de
    // forma segura (produce un scope vacío) y reintroducir un ámbito
    // no-global en el futuro no debería exigir una migración de esquema.
    ambito: { type: String, enum: ['global'], default: 'global' },
    estado: { type: String, enum: ['activo', 'inactivo'], default: 'activo' },
    // Protege los 6 roles semilla de la especificación original de
    // borrado/renombrado de slug accidental desde RolesPage; sus permisos sí
    // se pueden seguir editando.
    esSistema: { type: Boolean, default: false },
  },
  { timestamps: true }
)

rolSchema.index({ estado: 1 })

export default mongoose.model('Rol', rolSchema)
