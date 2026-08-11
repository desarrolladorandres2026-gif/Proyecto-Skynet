import Usuario from '../../models/Usuario.js'
import Rol from '../../models/Rol.js'
import Permiso from '../../models/Permiso.js'
import ModuloSistema from '../../models/ModuloSistema.js'
import Ausencia from '../../models/Ausencia.js'
import ReporteDano from '../../models/ReporteDano.js'
import Requerimiento from '../../models/Requerimiento.js'
import RegistroAuditoria from '../../models/RegistroAuditoria.js'
import EmailCuenta from '../../models/EmailCuenta.js'
import Equipo from '../../models/mantenimiento/Equipo.js'
import TipoEquipo from '../../models/mantenimiento/TipoEquipo.js'
import Marca from '../../models/mantenimiento/Marca.js'
import Mantenimiento from '../../models/mantenimiento/Mantenimiento.js'
import Hallazgo from '../../models/mantenimiento/Hallazgo.js'
import BitacoraEntrada from '../../models/mantenimiento/BitacoraEntrada.js'
import InventarioMaterial from '../../models/mantenimiento/InventarioMaterial.js'
import MovimientoInventario from '../../models/mantenimiento/MovimientoInventario.js'
import PlantillaMantenimiento from '../../models/mantenimiento/PlantillaMantenimiento.js'
import ConfiguracionSLA from '../../models/mantenimiento/ConfiguracionSLA.js'
import ArticuloConocimiento from '../../models/mantenimiento/ArticuloConocimiento.js'

// Registro único de qué colecciones entran en el backup y con qué nombre de
// hoja (máx 31 caracteres, límite de Excel). Deliberadamente NO incluye
// TODAS las colecciones de Mongo: quedan afuera las que son plomería técnica
// o sesión (PasswordResetToken, EmailConexionSolicitud, PushSubscription,
// EnvioNotificacion) o preferencias de UI sin valor de respaldo
// (ConfiguracionIA/PreferenciaIA/PreferenciaNotificacion), y las que son
// memoria/conversación del Copiloto (ConversacionCopiloto, MemoriaCopiloto,
// AvisoIA) por ser estado efímero de IA, no un registro de negocio. Si el
// futuro pide respaldar alguna de estas, se agrega aquí.
//
// `camposExcluir`: nunca deben viajar en un archivo que puede terminar en el
// disco de una laptop — hashes de contraseña y tokens/credenciales cifradas.
export const COLECCIONES_BACKUP = [
  { modelo: Usuario, hoja: 'Usuarios', camposExcluir: ['password'] },
  { modelo: Rol, hoja: 'Roles' },
  { modelo: Permiso, hoja: 'Permisos' },
  { modelo: ModuloSistema, hoja: 'Módulos del sistema' },
  { modelo: Ausencia, hoja: 'Ausencias' },
  { modelo: ReporteDano, hoja: 'Reportes de daños' },
  { modelo: Requerimiento, hoja: 'Requerimientos' },
  // La razón de ser de este módulo: RegistroAuditoria se purga solo cada
  // AUDITORIA_RETENCION_MESES (3 por defecto, ver auditoria.worker.js) — sin
  // backup, esos registros desaparecen para siempre pasado ese plazo.
  { modelo: RegistroAuditoria, hoja: 'Auditoría' },
  { modelo: EmailCuenta, hoja: 'Cuentas de correo', camposExcluir: ['refreshTokenCifrado'] },
  { modelo: Equipo, hoja: 'Equipos' },
  { modelo: TipoEquipo, hoja: 'Tipos de equipo' },
  { modelo: Marca, hoja: 'Marcas' },
  { modelo: Mantenimiento, hoja: 'Órdenes de mantenimiento' },
  { modelo: Hallazgo, hoja: 'Hallazgos' },
  { modelo: BitacoraEntrada, hoja: 'Bitácora de entradas' },
  { modelo: InventarioMaterial, hoja: 'Inventario de materiales' },
  { modelo: MovimientoInventario, hoja: 'Movimientos de inventario' },
  { modelo: PlantillaMantenimiento, hoja: 'Plantillas de mantenimiento' },
  { modelo: ConfiguracionSLA, hoja: 'Configuración SLA' },
  { modelo: ArticuloConocimiento, hoja: 'Base de conocimiento' },
]
