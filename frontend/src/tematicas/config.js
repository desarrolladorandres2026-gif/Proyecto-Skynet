// Ajustes locales del módulo de temáticas (Navidad, etc.).
//
// La temática que ven los usuarios se elige en Sistema → Temática (global,
// guardada en el backend). Esto son solo los interruptores del propio código.

// Interruptor maestro. false = el sistema se ve sin ninguna temática, sin
// importar lo que diga el servidor.
export const TEMATICAS_ACTIVAS = true

// Sonido de bienvenida al iniciar sesión (si la temática activa trae uno).
// false = nunca suena nada.
export const SONIDO_AL_INICIAR_SESION = true

// Valor mientras no se ha podido leer el del servidor (primera carga sin red):
//   'auto'    → la temática cuya temporada esté vigente hoy (o ninguna)
//   'ninguna' → sin decoración
//   '<id>'    → una temática fija
export const TEMATICA_POR_DEFECTO = 'auto'
