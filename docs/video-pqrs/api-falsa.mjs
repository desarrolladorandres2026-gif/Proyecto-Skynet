// API de ejemplo para grabar el video de las PQRS con la interfaz REAL de Skynet.
// El frontend construido (vite build) consulta /api/*; aquí se responde con datos
// ficticios y un estado que avanza como el real (radicados.service.js). Nada de
// lo que hay aquí son datos reales: personas, radicados y correos son de ejemplo.

const PERSONAS = {
  operador: { id: 'u-op', nombre: 'Laura Gómez', cargo: 'Atención al usuario', dependencia: 'Atención al Ciudadano', rol: { nombre: 'Operador', slug: 'operador', panel: true }, permisos: ['pqrs:gestionar'] },
}
export const PERSONAS_EJEMPLO = PERSONAS

const fecha = (d) => d.toISOString().slice(0, 19).replace('T', ' ')
const hace = (dias) => fecha(new Date(Date.now() - dias * 86400000))

const FORM = { id: 1, titulo: 'Peticiones, Quejas y Reclamos' }
const campos = (o) => [
  ['tf_field_48', 'Tipo de Solicitud', o.tipo], ['tf_field_49', 'Nombre Del Solicitante', o.nombre], ['tf_field_50', 'Tipo de documento', 'Cédula de ciudadanía (CC)'],
  ['tf_field_51', 'Número de identificación', o.cedula || '1075000000'], ['tf_field_52', 'Correo Electronico', o.correo], ['tf_field_55', 'Ciudad', 'Neiva'],
  ['tf_field_56', 'Tipo de usuario', 'Usuario'], ['tf_field_60', 'Presentada mediante', 'Escrita'],
  ['tf_field_61', 'Detalles del PQR: Asunto/Referencia', o.asunto], ['tf_field_62', 'Ingrese su inquietud/comentario', o.texto],
].map(([clave, etiqueta, valor]) => ({ clave, etiqueta, valor, adjunto: false }))

export class ApiFalsa {
  constructor() {
    this.quien = 'operador'
    this.log = []
    this.desconocidas = new Set()
    this.siguiente = 9001
    this.radicados = [
      this.crear({ id: 8998, radicado: 'TTN-2027-0118', estado: 'tramitado', dias: 6, tipo: 'Felicitación', nombre: 'Carlos Rojas', correo: 'carlos.rojas@ejemplo.test', asunto: 'Excelente atención en taquilla', texto: 'Quiero felicitar al personal de la taquilla 4 por su amabilidad.' }),
      this.crear({ id: 8999, radicado: 'TTN-2027-0119', estado: 'leido', dias: 2, tipo: 'Reclamo', nombre: 'Marta Díaz', correo: 'marta.diaz@ejemplo.test', asunto: 'Cobro de tasa de uso', texto: 'Me cobraron dos veces la tasa de uso de terminal.' }),
    ]
    this.respuestas = {} // id -> [respuesta]
    this.nueva = null // radicado que radica la ciudadana en el video
  }

  usuario() {
    const p = PERSONAS.operador
    return {
      id_usuario: p.id, nombre_usuario: 'laura.gomez', nombre: p.nombre, email: 'laura@ejemplo.test',
      rol: { id: 'r-operador', nombre: p.rol.nombre, slug: p.rol.slug, ambito: 'global', panelEscritorio: true },
      esSuperAdmin: false, permisos: p.permisos, empresaId: null, dependencia: p.dependencia, cargo: p.cargo,
      modulos: [], estado: 'activo', debeCambiarPassword: false,
      modulosDesactivados: ['ia', 'copiloto', 'email', 'avisos_terminal', 'videos'],
    }
  }

  crear({ id, radicado, estado, dias, tipo, nombre, correo, asunto, texto }) {
    return { id, radicado, formulario: FORM, estado, fecha: hace(dias), ip: '190.xxx.xxx.12', navegador: 'Chrome', campos: campos({ tipo, nombre, correo, asunto, texto }), resumen: { tipo, asunto, solicitante: nombre, correo } }
  }

  // La ciudadana radica desde el sitio público (WordPress): llega sin leer.
  radicar(d) {
    const r = this.crear({ id: this.siguiente++, radicado: 'TTN-2027-0120', estado: 'sin_leer', dias: 0, ...d })
    this.nueva = r
    this.radicados.unshift(r)
    return r
  }

  porId(id) { return this.radicados.find((r) => String(r.id) === String(id)) }
  fila(r) { return { id: r.id, radicado: r.radicado, formulario: r.formulario, estado: r.estado, fecha: r.fecha, resumen: r.resumen, posibleSpam: false } }

  responder(metodo, ruta, query, cuerpo) {
    this.log.push(`${metodo} ${ruta}`)
    const m = (re) => ruta.match(re)
    if (ruta === '/auth/me') return { usuario: this.usuario() }
    if (ruta === '/auth/logout') return { ok: true }

    if (ruta === '/sitio-web/radicados/formularios') {
      const t = this.radicados.length, s = this.radicados.filter((r) => r.estado === 'sin_leer').length
      return { formularios: [{ id: 1, titulo: FORM.titulo, total: t, sinLeer: s }] }
    }
    if (ruta === '/sitio-web/radicados' && metodo === 'GET') return { radicados: this.radicados.map((r) => this.fila(r)), total: this.radicados.length, totalPaginas: 1 }
    let x
    if ((x = m(/^\/sitio-web\/radicados\/(\d+)$/)) && metodo === 'GET') {
      const r = this.porId(x[1]); if (!r) return { _status: 404, error: 'No existe' }
      return { radicado: { ...r, correoRespuesta: r.resumen.correo, respuestas: this.respuestas[r.id] || [] } }
    }
    if ((x = m(/^\/sitio-web\/radicados\/(\d+)\/estado$/)) && metodo === 'PUT') {
      const r = this.porId(x[1]); const b = cuerpo.json || {}
      if (!(b.soloSiSinLeer && r.estado !== 'sin_leer')) r.estado = b.estado
      return { id: r.id, estado: r.estado }
    }
    if ((x = m(/^\/sitio-web\/radicados\/(\d+)\/respuesta$/)) && metodo === 'POST') {
      const r = this.porId(x[1]); const f = cuerpo.campos || {}
      const ahora = fecha(new Date())
      const resp = {
        id: 500 + (this.respuestas[r.id]?.length || 0), nota: f.nota || '', archivoUrl: '', archivoNombre: '', autor: 'laura.gomez', fecha: ahora,
        constancia: { id: 'c1', respondidoPor: 'Laura Gómez', nombreUsuario: 'laura.gomez', fecha: ahora, correo: { destinatario: r.resumen.correo, estado: f.enviarCorreo === 'false' ? 'no_enviado' : 'enviado', enviadoEn: ahora, adjuntoIncluido: false, error: '' } },
      }
      this.respuestas[r.id] = [...(this.respuestas[r.id] || []), resp]
      r.estado = 'tramitado'
      return { _status: 201, respuesta: resp, constancia: resp.constancia, estado: 'tramitado' }
    }
    if (ruta === '/tematica') return { modo: 'ninguna' }
    if (ruta === '/plataforma/estado') return { estado: null, mantenimiento: false }
    if (/^\/notificaciones/.test(ruta)) return { notificaciones: [], items: [], total: 0, noLeidas: 0, pendientes: 0 }
    if (/^\/dashboard/.test(ruta)) return {}
    return null
  }
}
