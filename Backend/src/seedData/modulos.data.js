// Fuente única de verdad del catálogo de módulos del sistema (igual que
// rbac.data.js lo es para roles/permisos). Cada `key` debe coincidir con la
// entrada correspondiente de frontend/src/config/modulosRegistry.js.
//
// Al agregar un módulo nuevo al sistema: se agrega aquí y el arranque del
// backend lo upserta en la colección ModuloSistema (activo por defecto), sin
// migraciones ni seeds manuales. `esNucleo: true` lo excluye de la
// desactivación desde la pantalla "Módulos del sistema".
export const MODULOS_SISTEMA = [
  {
    key: 'dashboard',
    nombre: 'Panel (Dashboard)',
    descripcion: 'Tablero principal con tarjetas según el rol. Es la página de inicio de todos los usuarios.',
    esNucleo: true,
    orden: 1,
  },
  {
    key: 'usuarios',
    nombre: 'Usuarios',
    descripcion: 'Gestión de cuentas de usuario del sistema.',
    esNucleo: true,
    orden: 2,
  },
  {
    key: 'roles',
    nombre: 'Roles y permisos',
    descripcion: 'Administración del RBAC dinámico.',
    esNucleo: true,
    orden: 3,
  },
  {
    key: 'catalogos',
    nombre: 'Dependencias y cargos',
    descripcion: 'Catálogo de dependencias y cargos, seleccionables en Usuarios, Requerimientos y Equipos.',
    esNucleo: true,
    orden: 3.5,
  },
  {
    key: 'auditoria',
    nombre: 'Auditoría',
    descripcion: 'Registro de trazabilidad de todas las mutaciones. Columna vertebral de cumplimiento.',
    esNucleo: true,
    orden: 4,
  },
  {
    key: 'sistema',
    nombre: 'Sistema',
    descripcion: 'Configuración de la plataforma, incluida esta pantalla de módulos.',
    esNucleo: true,
    orden: 5,
  },
  {
    // orden fraccional a propósito: se pide justo debajo de "Panel" (orden 1)
    // sin renumerar los módulos núcleo existentes (2-5).
    key: 'email',
    nombre: 'Email',
    descripcion: 'Gestión inteligente del correo electrónico mediante Skynet. Permite consultar, buscar, resumir, redactar y gestionar correos desde el asistente.',
    esNucleo: false,
    orden: 1.5,
  },
  {
    key: 'danos',
    nombre: 'Reportes de daños',
    descripcion: 'Reporte universal de daños con foto y su gestión como tareas de mantenimiento.',
    esNucleo: false,
    orden: 10,
  },
  {
    key: 'requerimientos',
    nombre: 'Requerimientos',
    descripcion: 'Solicitud y aprobación de requerimientos de compra y servicio (Financiero + Bodega).',
    esNucleo: false,
    orden: 13,
  },
  {
    key: 'ausencias',
    nombre: 'Ausencias',
    descripcion: 'Vacaciones, permisos e incapacidades: solicitud, aprobación, saldos y calendario del personal.',
    esNucleo: false,
    orden: 14,
  },
  {
    key: 'mantenimiento',
    nombre: 'Mantenimiento TI (legado)',
    descripcion: 'Equipos de TI y sus mantenimientos programados.',
    esNucleo: false,
    orden: 20,
  },
  {
    key: 'copiloto',
    nombre: 'Skynet',
    descripcion:
      'Asistente conversacional (Google Gemini) que responde preguntas sobre tus propios requerimientos, reportes de daño y ausencias. Solo lectura: no aprueba ni modifica nada.',
    esNucleo: false,
    orden: 15,
  },
  {
    key: 'ia',
    nombre: 'IA',
    descripcion:
      'Avisos proactivos de Skynet en el chat (con voz): nuevos requerimientos, reportes de daño, ausencias y mantenimiento. Configurable a nivel global (Super Admin) y personal (cada usuario).',
    esNucleo: false,
    orden: 16,
  },
]
