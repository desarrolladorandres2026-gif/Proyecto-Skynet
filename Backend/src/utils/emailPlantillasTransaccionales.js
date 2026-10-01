// Correos que no son notificaciones de un módulo: seguridad de la cuenta
// (conexión de Gmail, restablecer contraseña) y el protocolo de despliegue del
// copiloto. Usan el mismo sistema visual que las notificaciones
// (utils/emailDiseno.js), así que cualquier correo de Skynet se reconoce como
// de la misma familia. Todo dato que puede venir de fuera (nombre, IP,
// user-agent) se escapa en emailDiseno.js: sin eso, un User-Agent fabricado a
// mano podría inyectar marcado — o reescribir el propio botón "Aprobar" —
// dentro de un correo que existe justamente para ser una fuente confiable
// fuera de banda.
import { documentoCorreo, documentoTexto, parrafo, nota, notaHtml, enlace, esc } from './emailDiseno.js'

const CATEGORIA_SEGURIDAD = 'Seguridad de la cuenta'
const PIE_SEGURIDAD = 'Es un aviso de seguridad: te llega aunque hayas desactivado los correos.'

function saludo(nombre) {
  return nombre ? `Hola ${nombre},` : 'Hola,'
}

function vigencia(minutos) {
  if (minutos % 60 === 0) return minutos === 60 ? '1 hora' : `${minutos / 60} horas`
  return `${minutos} minutos`
}

// ── Conexión de una cuenta de correo (Gmail hoy, cualquier proveedor futuro)
function contenidoConexion({ nombreUsuario, proveedor, ip, userAgent, ttlMinutos, scopeDescripcion }) {
  return {
    titulo: `Intento de conexión de ${proveedor}`,
    cuerpo: `${saludo(nombreUsuario)} alguien con acceso a tu cuenta intentó conectar una cuenta de ${proveedor} al módulo Email. Todavía no se ha conectado nada: hace falta tu aprobación desde este correo.`,
    detalles: [
      { etiqueta: 'Dirección IP', valor: ip || 'Desconocida' },
      { etiqueta: 'Dispositivo', valor: userAgent || 'Desconocido' },
      { etiqueta: 'Permitiría', valor: scopeDescripcion },
      { etiqueta: 'Vence en', valor: vigencia(ttlMinutos) },
    ],
    advertencia: 'Si no fuiste tú, deniega la conexión y cambia tu contraseña cuanto antes: alguien más tiene sesión iniciada en tu cuenta.',
  }
}

export function correoConexionCuenta({
  nombreUsuario,
  proveedor,
  aprobarLink,
  denegarLink,
  ip,
  userAgent,
  fecha = new Date(),
  ttlMinutos = 15,
  scopeDescripcion,
}) {
  const c = contenidoConexion({ nombreUsuario, proveedor, ip, userAgent, ttlMinutos, scopeDescripcion })
  return documentoCorreo({
    titulo: c.titulo,
    preheader: `No se conectará nada sin tu aprobación. El enlace vence en ${vigencia(ttlMinutos)}.`,
    categoria: CATEGORIA_SEGURIDAD,
    fecha,
    cuerpoHtml: parrafo(c.cuerpo),
    detalles: c.detalles,
    accion: { etiqueta: 'Aprobar y continuar', url: aprobarLink },
    accionSecundaria: { etiqueta: 'Denegar', url: denegarLink },
    despuesHtml: nota(c.advertencia),
    pieHtml: esc(PIE_SEGURIDAD),
  })
}

export function correoConexionCuentaTexto({ nombreUsuario, proveedor, aprobarLink, denegarLink, ip, userAgent, fecha = new Date(), ttlMinutos = 15, scopeDescripcion }) {
  const c = contenidoConexion({ nombreUsuario, proveedor, ip, userAgent, ttlMinutos, scopeDescripcion })
  return documentoTexto({
    titulo: c.titulo,
    categoria: CATEGORIA_SEGURIDAD,
    fecha,
    parrafos: [c.cuerpo],
    detalles: c.detalles,
    accion: { etiqueta: 'Aprobar y continuar', url: aprobarLink },
    nota: `Denegar: ${denegarLink}\n\n${c.advertencia}`,
    pie: PIE_SEGURIDAD,
  })
}

// ── Restablecer contraseña
function contenidoReset({ nombreUsuario, ttlMinutos }) {
  return {
    titulo: 'Restablece tu contraseña',
    cuerpo: `${saludo(nombreUsuario)} recibimos una solicitud para restablecer la contraseña de tu cuenta en la plataforma.`,
    detalles: [{ etiqueta: 'Vence en', valor: vigencia(ttlMinutos) }],
    advertencia: 'Si no pediste este cambio, ignora este correo: tu contraseña sigue siendo la misma.',
  }
}

export function correoRestablecerPassword({ nombreUsuario, enlace: url, ttlMinutos = 60, fecha = new Date() }) {
  const c = contenidoReset({ nombreUsuario, ttlMinutos })
  return documentoCorreo({
    titulo: c.titulo,
    preheader: `Crea una contraseña nueva desde este correo. El enlace vence en ${vigencia(ttlMinutos)}.`,
    categoria: CATEGORIA_SEGURIDAD,
    fecha,
    cuerpoHtml: parrafo(c.cuerpo),
    detalles: c.detalles,
    accion: { etiqueta: 'Crear contraseña nueva', url },
    despuesHtml:
      nota(c.advertencia) + nota('Si el botón no funciona, copia este enlace en tu navegador:') + notaHtml(enlace(url)),
    pieHtml: esc(PIE_SEGURIDAD),
  })
}

export function correoRestablecerPasswordTexto({ nombreUsuario, enlace: url, ttlMinutos = 60, fecha = new Date() }) {
  const c = contenidoReset({ nombreUsuario, ttlMinutos })
  return documentoTexto({
    titulo: c.titulo,
    categoria: CATEGORIA_SEGURIDAD,
    fecha,
    parrafos: [c.cuerpo],
    detalles: c.detalles,
    accion: { etiqueta: 'Crea una contraseña nueva aquí', url },
    nota: c.advertencia,
    pie: PIE_SEGURIDAD,
  })
}

// ── Protocolo de despliegue (ver copiloto.despliegue.js)
// Contenido 100% estático (sin datos que vengan de fuera), a propósito: es un
// envío de verificación, no debe depender de nada que pueda fallar al
// interpolarse.
const PRUEBA = {
  titulo: 'Verificación de comunicaciones',
  categoria: 'Prueba de comunicaciones',
  parrafos: [
    'Esta es únicamente una prueba de funcionamiento del sistema de comunicaciones de la plataforma.',
    'Estamos verificando que el sistema pueda enviar correctamente los mensajes a los usuarios registrados antes del lanzamiento oficial.',
    'No es necesario realizar ninguna acción.',
  ],
  cierre: 'Si recibiste este mensaje, la prueba de comunicaciones funcionó correctamente.',
  pie: 'Mensaje de verificación enviado a todo el personal registrado en la plataforma.',
}

export function correoPruebaComunicaciones() {
  return documentoCorreo({
    titulo: PRUEBA.titulo,
    preheader: 'Prueba del sistema de correo de la plataforma. No necesitas hacer nada.',
    categoria: PRUEBA.categoria,
    cuerpoHtml: PRUEBA.parrafos.map((p) => parrafo(p)).join('') + parrafo(PRUEBA.cierre, { destacado: true }),
    pieHtml: esc(PRUEBA.pie),
  })
}

export function correoPruebaComunicacionesTexto() {
  return documentoTexto({
    titulo: PRUEBA.titulo,
    categoria: PRUEBA.categoria,
    parrafos: [...PRUEBA.parrafos, PRUEBA.cierre],
    pie: PRUEBA.pie,
  })
}

// `loginUrl` sí es dinámico (env.FRONTEND_URL + '/login', armado por quien
// llama — ver copiloto.despliegue.js); emailDiseno.js lo escapa al armar el
// botón.
const LANZAMIENTO = {
  titulo: 'El sistema está listo',
  categoria: 'Lanzamiento de la plataforma',
  antes: [
    'Hoy damos un nuevo paso en la forma en que gestionamos nuestra operación.',
    'La plataforma ya está disponible. Tu acceso está habilitado.',
  ],
  despues: [
    'Te recomendamos ingresar con tus credenciales y realizar tu primer acceso.',
    'Si es tu primer ingreso, durante la capacitación te acompañaremos paso a paso para que conozcas las principales funciones de la plataforma.',
  ],
  cierre: 'Bienvenido al Terminal de Transportes de Neiva. Un solo sistema. Una operación más conectada.',
}

export function correoDespliegueOficial({ loginUrl }) {
  return documentoCorreo({
    titulo: LANZAMIENTO.titulo,
    preheader: 'La plataforma ya está disponible y tu acceso está habilitado.',
    categoria: LANZAMIENTO.categoria,
    cuerpoHtml: LANZAMIENTO.antes.map((p) => parrafo(p)).join(''),
    accion: { etiqueta: 'Acceder a la plataforma', url: loginUrl },
    despuesHtml: LANZAMIENTO.despues.map((p) => parrafo(p)).join('') + parrafo(LANZAMIENTO.cierre, { destacado: true }),
  })
}

export function correoDespliegueOficialTexto({ loginUrl }) {
  return documentoTexto({
    titulo: LANZAMIENTO.titulo,
    categoria: LANZAMIENTO.categoria,
    parrafos: LANZAMIENTO.antes,
    accion: { etiqueta: 'Accede aquí', url: loginUrl },
    nota: [...LANZAMIENTO.despues, LANZAMIENTO.cierre].join('\n\n'),
  })
}
