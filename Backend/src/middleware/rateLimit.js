import rateLimit from 'express-rate-limit'

// Limitador estricto para el login: frena la fuerza bruta / diccionario contra
// credenciales. Cuenta por IP; en producción detrás de un proxy hay que activar
// app.set('trust proxy', 1) para que use la IP real del cliente.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 intentos por IP y ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Inténtalo de nuevo más tarde.' },
})

// Limitador para el flujo de reset: evita spam de correos y fuerza bruta del
// token. Más permisivo en ventana, pero acotado en número.
export const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.' },
})
