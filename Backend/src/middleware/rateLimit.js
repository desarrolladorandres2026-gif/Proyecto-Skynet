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

// El copiloto (IA) usa la capa gratuita de Gemini, compartida por TODO el
// backend (no es una cuota por usuario) — sin este límite, una sola persona
// encadenando preguntas podría agotarla para todos los demás. Cuenta por IP,
// igual que loginLimiter/resetLimiter.
export const copilotoLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados mensajes seguidos. Espera un momento antes de volver a preguntar.' },
})

// El backup recorre TODAS las colecciones del negocio en una sola petición
// — pesado para el VPS compartido de producción. Es una herramienta de
// mantenimiento de Super Admin, no un flujo de uso frecuente, así que una
// ventana amplia y un tope bajo no estorban el uso real y sí evitan que un
// clic accidental repetido (o un script) lo dispare en bucle.
export const backupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de backup en poco tiempo. Inténtalo de nuevo más tarde.' },
})

// Envío de correo real: tanto el disparo de la invitación de conexión de
// Gmail (usa el remitente transaccional COMPARTIDO del sistema, el mismo que
// manda los resets de password) como el envío desde la cuenta ya conectada
// del usuario. Sin límite, una sola cuenta podría agotar la reputación/cupo
// del remitente compartido y afectar los correos de TODOS los usuarios.
// Exportar respuestas SIG a Excel recorre potencialmente miles de documentos
// y arma el .xlsx completo en memoria (ver sig-excel.service.js) — igual de
// pesado en espíritu que el backup completo, aunque de menor alcance (una
// sola colección). Ventana/tope menos estrictos que backupLimiter porque es
// una acción de uso más frecuente para SIG/HSEQ, pero igual evita que un
// doble clic o un script lo dispare en bucle.
export const sigExportarLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas exportaciones seguidas. Espera unos minutos antes de volver a intentarlo.' },
})

export const emailAccionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de correo en poco tiempo. Inténtalo de nuevo más tarde.' },
})

// GET /api/plataforma/estado es el ÚNICO endpoint del sistema que responde
// sin autenticación alguna (la pantalla de login necesita consultarlo antes
// de que exista sesión) y además el frontend lo consulta por polling. Esa
// combinación lo convierte en el candidato natural a amplificador, así que
// lleva límite propio.
//
// El tope es deliberadamente alto: el Terminal puede salir a internet detrás
// de una sola IP pública, así que TODOS los navegadores abiertos comparten
// contador. Con ~25 personas sondeando cada 15s (la cadencia de la pantalla
// de mantenimiento, la más agresiva) son ~100 peticiones por minuto; 240 deja
// el doble de margen y aun así corta en seco un bucle de abuso, que haría
// miles. La respuesta se sirve de una caché en memoria de 5s, así que ni
// siquiera toca Mongo.
export const estadoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas de estado. Espera un momento.' },
})
