// Sistema visual único de los correos de Skynet y de las páginas mínimas que se
// abren desde ellos (baja de avisos, aprobar/denegar Gmail). Cualquier correo
// nuevo se arma con documentoCorreo(): así todos comparten tipografía, colores
// y estructura sin copiar HTML entre plantillas.
//
// Identidad: la del Terminal, no la del panel de Skynet. Fondo blanco plano,
// el logo institucional arriba y sus colores (azul y verde, muestreados del
// propio logo) como único acento. La jerarquía la dan la tipografía, el
// espacio y líneas finas de 1px: nada de tarjetas ni fondos de color detrás
// del contenido. El titular va en serif porque el logotipo "El Terminal" es
// serif; el resto en la sans del sistema, que es lo que mejor se lee en móvil.
//
// Restricciones de correo que explican el HTML: maquetación con tablas y
// estilos en línea (Outlook de escritorio renderiza con el motor de Word),
// sin fuentes web (Gmail las descarta) y sin SVG (Gmail y Outlook no lo
// muestran). El logo viaja adjunto e incrustado por CID (ver utils/email.js):
// no depende de que haya un dominio público sirviéndolo y Outlook no lo
// bloquea como bloquea las imágenes remotas.

export const CID_LOGO = 'logo-el-terminal@skynet'

// Todos los textos superan 4.5:1 sobre blanco (tinta 14:1, texto 7.8:1,
// azul 6.1:1, verde 5.7:1): ningún texto "apagado" que haya que forzar la
// vista para leer. `linea` y `verdeMarca` (el verde vivo del logo, que junto
// al azul se perdía como un solo trazo oscuro) solo se usan en filetes, nunca
// para texto.
const COLOR = {
  papel: '#ffffff',
  tinta: '#0f2a43',
  texto: '#3e5468',
  azul: '#15679b',
  verde: '#3d7318',
  verdeMarca: '#5ea530',
  linea: '#d5dee7',
}

const SERIF = "Georgia, 'Times New Roman', Times, serif"
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

export const INSTITUCION = 'El Terminal de Transportes de Neiva'

export function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// Los emojis que algunos módulos ponen en el título pensando en el push
// (p. ej. el del cuestionario SIG) no se sostienen en un titular serif y
// restan seriedad en la bandeja de entrada. Se quitan solo en el correo.
export function sinEmoji(texto) {
  return String(texto ?? '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Zona del Terminal explícita: el proceso Node corre en UTC en el VPS.
export function fechaHora(fecha) {
  return new Date(fecha ?? Date.now()).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function fechaLarga(fecha) {
  return new Date(fecha).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' })
}

// "Del 3 al 7 de octubre de 2026" en vez de repetir mes y año en los dos
// extremos: se lee como lo diría una persona.
export function rangoFechas(inicio, fin) {
  const formato = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' })
  const partes = (f) => Object.fromEntries(formato.formatToParts(new Date(f)).map((p) => [p.type, p.value]))
  const a = partes(inicio)
  const b = partes(fin)
  if (a.year !== b.year) return `Del ${a.day} de ${a.month} de ${a.year} al ${b.day} de ${b.month} de ${b.year}`
  if (a.month !== b.month) return `Del ${a.day} de ${a.month} al ${b.day} de ${b.month} de ${b.year}`
  if (a.day !== b.day) return `Del ${a.day} al ${b.day} de ${b.month} de ${b.year}`
  return `${a.day} de ${a.month} de ${a.year}`
}

// `destacado`: la frase que cierra o resume el mensaje, en tinta y seminegrita.
export function parrafo(texto, { destacado = false } = {}) {
  const estilo = destacado ? `color:${COLOR.tinta};font-weight:600;` : `color:${COLOR.texto};`
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:26px;${estilo}">${esc(texto)}</p>`
}

// Texto secundario tras los botones: vencimientos, qué hacer si no fuiste tú.
// `nota` recibe texto plano; `notaHtml`, marcado ya armado con enlace()/esc().
export function nota(texto) {
  return notaHtml(esc(texto))
}

export function notaHtml(html) {
  return `<p style="margin:0 0 12px;font-family:${SANS};font-size:14px;line-height:22px;color:${COLOR.texto};">${html}</p>`
}

// Sin `texto`, el enlace muestra la URL misma y se deja partir en cualquier
// punto: una URL larga con token no tiene espacios donde cortar y, sin eso,
// desborda la pantalla del móvil.
export function enlace(url, texto) {
  const partir = texto === undefined ? 'word-break:break-all;' : ''
  return `<a href="${esc(url)}" style="color:${COLOR.azul};text-decoration:underline;${partir}">${esc(texto ?? url)}</a>`
}

// Firma de la marca: un filete que va del azul al verde, como las barras del
// logo. Es el único elemento de color fuera del logo y del botón.
function filete() {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 32px;">
                <tr>
                  <td width="70%" style="border-top:2px solid ${COLOR.azul};font-size:0;line-height:0;">&nbsp;</td>
                  <td width="30%" style="border-top:2px solid ${COLOR.verdeMarca};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>`
}

function filaDetalle({ etiqueta, valor }) {
  return `<tr>
                  <td width="36%" valign="top" style="padding:12px 16px 12px 0;border-bottom:1px solid ${COLOR.linea};font-family:${SANS};font-size:14px;line-height:22px;color:${COLOR.texto};">${esc(etiqueta)}</td>
                  <td valign="top" style="padding:12px 0;border-bottom:1px solid ${COLOR.linea};font-family:${SANS};font-size:15px;line-height:22px;font-weight:600;color:${COLOR.tinta};word-break:break-word;">${esc(valor)}</td>
                </tr>`
}

function listaDetalles(detalles) {
  const filas = (detalles || []).filter((d) => d?.etiqueta && String(d.valor ?? '').trim())
  if (!filas.length) return ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;border-top:1px solid ${COLOR.linea};">
                ${filas.map(filaDetalle).join('')}
              </table>`
}

// Botones: la única superficie con fondo del correo, porque es un control que
// hay que poder tocar. El secundario va solo con borde para que la acción
// principal no compita con él.
function boton({ etiqueta, url }, { secundario = false } = {}) {
  const fondo = secundario ? COLOR.papel : COLOR.azul
  const color = secundario ? COLOR.azul : COLOR.papel
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${secundario ? '12px' : '32px'} 0 0;">
                <tr>
                  <td bgcolor="${fondo}" style="border-radius:6px;background-color:${fondo};${secundario ? `border:1px solid ${COLOR.azul};` : ''}">
                    <a href="${esc(url)}" style="display:inline-block;padding:${secundario ? '12px 23px' : '13px 24px'};font-family:${SANS};font-size:15px;line-height:20px;font-weight:600;color:${color};text-decoration:none;border-radius:6px;">${esc(etiqueta)}</a>
                  </td>
                </tr>
              </table>`
}

/**
 * Correo completo. Todo lo que llega como texto plano se escapa aquí; los
 * campos *Html ya vienen armados con parrafo()/enlace()/esc().
 *
 * detalles: [{ etiqueta, valor }] — los datos concretos del asunto (fechas,
 * responsables, montos...) que se leen de un vistazo bajo el cuerpo.
 * despuesHtml: lo que va tras los botones (armado con nota()/parrafo()).
 */
export function documentoCorreo({
  titulo,
  preheader,
  categoria,
  fecha = new Date(),
  cuerpoHtml = '',
  detalles,
  accion,
  accionSecundaria,
  despuesHtml,
  pieHtml,
}) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="x-apple-disable-message-reformatting">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${esc(titulo)}</title>
    <style>
      :root { color-scheme: light; supported-color-schemes: light; }
      @media only screen and (max-width: 600px) {
        .sk-contenedor { padding: 28px 20px 40px !important; }
        .sk-titulo { font-size: 23px !important; line-height: 30px !important; }
        .sk-categoria, .sk-fecha { display: block !important; width: 100% !important; text-align: left !important; }
        .sk-fecha { padding-top: 2px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:${COLOR.papel};">
    <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.papel};">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
            <tr>
              <td class="sk-contenedor" style="padding:40px 32px 48px;text-align:left;">
              <img src="cid:${CID_LOGO}" width="104" height="98" alt="${esc(INSTITUCION)}" style="display:block;width:104px;height:auto;border:0;outline:none;text-decoration:none;font-family:${SERIF};font-size:18px;line-height:24px;color:${COLOR.tinta};">
              ${filete()}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="sk-categoria" valign="top" style="font-family:${SANS};font-size:14px;line-height:20px;font-weight:600;color:${COLOR.azul};">${esc(categoria)}</td>
                  <td class="sk-fecha" valign="top" align="right" style="font-family:${SANS};font-size:14px;line-height:20px;color:${COLOR.texto};">${esc(fechaHora(fecha))}</td>
                </tr>
              </table>
              <h1 class="sk-titulo" style="margin:14px 0 18px;font-family:${SERIF};font-size:26px;line-height:34px;font-weight:normal;color:${COLOR.tinta};">${esc(titulo)}</h1>
              ${cuerpoHtml}
              ${listaDetalles(detalles)}
              ${accion ? boton(accion) : ''}
              ${accionSecundaria ? boton(accionSecundaria, { secundario: true }) : ''}
              ${despuesHtml ? `<div style="margin:28px 0 0;">${despuesHtml}</div>` : ''}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:48px 0 0;border-top:1px solid ${COLOR.linea};">
                <tr>
                  <td style="padding:20px 0 0;font-family:${SANS};font-size:13px;line-height:20px;color:${COLOR.texto};">
                    <p style="margin:0 0 6px;font-weight:600;color:${COLOR.verde};">${esc(INSTITUCION)}</p>
                    ${pieHtml ? `<p style="margin:0;">${pieHtml}</p>` : ''}
                  </td>
                </tr>
              </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

// Versión en texto plano con la misma información y orden que la HTML: un
// correo que es solo HTML pesa en contra en los filtros antispam.
export function documentoTexto({ titulo, categoria, fecha = new Date(), parrafos = [], detalles, accion, nota, pie }) {
  const lineas = [INSTITUCION, `${categoria}, ${fechaHora(fecha)}`, '', titulo, '', ...parrafos.flatMap((p) => [p, ''])]
  if (detalles?.length) lineas.push(...detalles.map((d) => `${d.etiqueta}: ${d.valor}`), '')
  if (accion) lineas.push(accion.url ? `${accion.etiqueta}: ${accion.url}` : accion.etiqueta, '')
  if (nota) lineas.push(nota, '')
  if (pie) lineas.push('--', pie)
  return lineas.join('\n').trim()
}

// Página mínima (no correo) que se abre desde un enlace del correo: misma
// identidad, sin logo adjunto (no hay CID fuera de un correo).
export function paginaSimple({ titulo, mensajeHtml, script = '' }) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(titulo)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${COLOR.papel};">
    <main style="max-width:440px;margin:0 auto;padding:18vh 24px 48px;font-family:${SANS};">
      <div style="display:flex;width:56px;"><span style="flex:7;border-top:2px solid ${COLOR.azul};"></span><span style="flex:3;border-top:2px solid ${COLOR.verdeMarca};"></span></div>
      <p style="margin:20px 0 0;font-size:14px;line-height:20px;font-weight:600;color:${COLOR.verde};">${esc(INSTITUCION)}</p>
      <h1 style="margin:12px 0 12px;font-family:${SERIF};font-size:26px;line-height:34px;font-weight:normal;color:${COLOR.tinta};">${esc(titulo)}</h1>
      <p style="margin:0;font-size:16px;line-height:26px;color:${COLOR.texto};">${mensajeHtml}</p>
    </main>
    ${script}
  </body>
</html>`
}

// Para destacar un dato dentro de una página (p. ej. la cuenta conectada).
export function destacado(texto) {
  return `<strong style="color:${COLOR.tinta};">${esc(texto)}</strong>`
}
