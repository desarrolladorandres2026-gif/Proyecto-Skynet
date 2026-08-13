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
import Dependencia from '../../models/Dependencia.js'
import Cargo from '../../models/Cargo.js'

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
//
// `campoFecha`: marca las colecciones PURGABLES por antigüedad (ver
// purga.service.js) — deliberadamente solo datos históricos/transaccionales
// que se acumulan con el tiempo. Los catálogos e identidades (Usuarios,
// Roles, Permisos, Equipos, Marcas, Plantillas, Cuentas de correo, Módulos)
// NUNCA llevan `campoFecha`: no tienen noción de "viejo = descartable", y
// purgarlos por fecha borraría cuentas activas o catálogos en uso.
// `clave`: identificador estable para que el frontend seleccione colecciones
// por checkbox (backup.routes.js::GET /colecciones) sin depender del texto
// de `hoja`, que es para mostrar, no para referenciar.
export const COLECCIONES_BACKUP = [
  { clave: 'usuarios', modelo: Usuario, hoja: 'Usuarios', camposExcluir: ['password'] },
  { clave: 'roles', modelo: Rol, hoja: 'Roles' },
  { clave: 'permisos', modelo: Permiso, hoja: 'Permisos' },
  { clave: 'dependencias', modelo: Dependencia, hoja: 'Dependencias' },
  { clave: 'cargos', modelo: Cargo, hoja: 'Cargos' },
  { clave: 'modulos', modelo: ModuloSistema, hoja: 'Módulos del sistema' },
  { clave: 'ausencias', modelo: Ausencia, hoja: 'Ausencias', campoFecha: 'fechaInicio' },
  { clave: 'danos', modelo: ReporteDano, hoja: 'Reportes de daños', campoFecha: 'fecha' },
  { clave: 'requerimientos', modelo: Requerimiento, hoja: 'Requerimientos', campoFecha: 'fechaSolicitud' },
  // La razón de ser de este módulo: RegistroAuditoria se purga solo cada
  // AUDITORIA_RETENCION_MESES (3 por defecto, ver auditoria.worker.js) — sin
  // backup, esos registros desaparecen para siempre pasado ese plazo. Se deja
  // también purgable a mano (6/12 meses) por si el Super Admin quiere
  // depurarla antes de que corra el worker automático.
  { clave: 'auditoria', modelo: RegistroAuditoria, hoja: 'Auditoría', campoFecha: 'creadoEn' },
  { clave: 'cuentas_correo', modelo: EmailCuenta, hoja: 'Cuentas de correo', camposExcluir: ['refreshTokenCifrado'] },
  { clave: 'equipos', modelo: Equipo, hoja: 'Equipos' },
  { clave: 'tipos_equipo', modelo: TipoEquipo, hoja: 'Tipos de equipo' },
  { clave: 'marcas', modelo: Marca, hoja: 'Marcas' },
  { clave: 'mantenimiento', modelo: Mantenimiento, hoja: 'Órdenes de mantenimiento', campoFecha: 'creado_en' },
  { clave: 'hallazgos', modelo: Hallazgo, hoja: 'Hallazgos' },
  { clave: 'bitacora', modelo: BitacoraEntrada, hoja: 'Bitácora de entradas', campoFecha: 'creado_en' },
  { clave: 'inventario', modelo: InventarioMaterial, hoja: 'Inventario de materiales' },
  { clave: 'movimientos_inventario', modelo: MovimientoInventario, hoja: 'Movimientos de inventario', campoFecha: 'creado_en' },
  { clave: 'plantillas', modelo: PlantillaMantenimiento, hoja: 'Plantillas de mantenimiento' },
  { clave: 'configuracion_sla', modelo: ConfiguracionSLA, hoja: 'Configuración SLA' },
  { clave: 'base_conocimiento', modelo: ArticuloConocimiento, hoja: 'Base de conocimiento' },
]

export const COLECCIONES_PURGABLES = COLECCIONES_BACKUP.filter((c) => c.campoFecha)
