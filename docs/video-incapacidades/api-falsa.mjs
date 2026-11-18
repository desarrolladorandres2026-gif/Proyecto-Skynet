// API de ejemplo para grabar el video con la interfaz REAL de Skynet.
//
// El frontend real (el que se construye con `vite build`) hace sus consultas a
// /api/*; aquí se responden con datos ficticios y un estado que avanza igual
// que el trámite real (incapacidades.service.js del backend). Así las pantallas
// que se ven en el video son las del proyecto, sin tocar ninguna base de datos.
//
// Nada de lo que hay aquí son datos reales: personas y cifras son de ejemplo.

const PERSONAS = {
  trabajador: { id: 'u-trab', nombre: 'Ana Pérez', cargo: 'Operador', dependencia: 'Operaciones', rol: { nombre: 'Usuario Común', slug: 'usuario_comun', panel: false }, permisos: [] },
  sig: { id: 'u-sig', nombre: 'Laura Gómez', cargo: 'Profesional SIG', dependencia: 'SIG', rol: { nombre: 'SIG', slug: 'sig', panel: true }, permisos: ['ausencias:verificar_incapacidades'] },
  secretaria: { id: 'u-sec', nombre: 'Marta Ruiz', cargo: 'Secretaria de Gerencia', dependencia: 'Gerencia', rol: { nombre: 'Secretaria de Gerencia', slug: 'secretaria_gerencia', panel: true }, permisos: ['ausencias:foliar_incapacidades'] },
  gerencia: { id: 'u-ger', nombre: 'Gerente', cargo: 'Gerente', dependencia: 'Gerencia', rol: { nombre: 'Gerencia', slug: 'gn', panel: true }, permisos: ['ausencias:direccionar_incapacidades', 'ausencias:supervisar_incapacidades'] },
  th: { id: 'u-th', nombre: 'Karol Tamayo', cargo: 'Auxiliar Admtva y G.H', dependencia: 'Talento Humano', rol: { nombre: 'Talento Humano', slug: 'talento_humano', panel: true }, permisos: ['ausencias:recibir_incapacidades', 'ausencias:aprobar', 'ausencias:ver_todas'] },
}
export const PERSONAS_EJEMPLO = PERSONAS

const dia = (iso) => `${iso}T05:00:00.000Z`

export class ApiFalsa {
  constructor() {
    this.quien = 'trabajador'
    this.log = []
    this.desconocidas = new Set()
    this.inc = null // la incapacidad del ejemplo (Ana Pérez), se crea al enviar el formulario
    this.otras = [] // otras incapacidades de ejemplo para la pantalla de supervisión
    this.soporte = null // { tipo, bytes } último soporte subido (lo que genera el escáner real)
  }

  usuario(clave = this.quien) {
    const p = PERSONAS[clave]
    return {
      id_usuario: p.id, nombre_usuario: p.nombre.toLowerCase().replace(/\s+/g, '.'), nombre: p.nombre, email: `${p.id}@ejemplo.test`,
      rol: { id: `r-${p.rol.slug}`, nombre: p.rol.nombre, slug: p.rol.slug, ambito: 'global', panelEscritorio: p.rol.panel },
      esSuperAdmin: false, permisos: p.permisos, empresaId: null, dependencia: p.dependencia, cargo: p.cargo,
      modulos: [], estado: 'activo', debeCambiarPassword: false,
      // Funciones no relacionadas con el trámite quedan apagadas para que no
      // aparezcan avisos ni paneles ajenos a lo que se explica.
      modulosDesactivados: ['ia', 'copiloto', 'email', 'avisos_terminal', 'videos', 'sitio_web'],
    }
  }

  quienEs = (clave) => ({ ...PERSONAS[clave] })

  // ── Construcción de documentos como los devuelve el backend ──
  firma(clave) { const p = PERSONAS[clave]; return { nombre: p.nombre, cargo: p.cargo } }
  paso(accion, clave, nota = '') { return { accion, nombre: PERSONAS[clave].nombre, cargo: PERSONAS[clave].cargo, fecha: new Date().toISOString(), nota } }

  nuevaIncapacidad({ fechaInicio, fechaFin, dias }) {
    const t = PERSONAS.trabajador
    this.inc = {
      _id: 'inc-ana', tipo: 'incapacidad', estado: 'pendiente', etapa: 'en_verificacion', etapaDesde: new Date().toISOString(),
      fechaInicio, fechaFin, diasHabiles: dias, motivo: '', cargoSolicitante: t.cargo, dependenciaSolicitante: t.dependencia,
      solicitante: { _id: t.id, nombre: t.nombre, nombre_usuario: 'ana.perez', cargo: t.cargo, dependencia: t.dependencia },
      soporte: { archivo: 'incapacidad.pdf', nombreArchivo: 'incapacidad_2027-03-01.pdf', mimetype: 'application/pdf', size: 650000 },
      decision: {}, verificacion: {}, folio: { destinatarioRegistrado: false }, direccionamiento: {}, tramite: {},
      historial: [this.paso('creada', 'trabajador')], createdAt: new Date().toISOString(),
    }
    return this.inc
  }

  vista(d) {
    // lo que añade el service a las bandejas: etapa efectiva y días en la etapa
    return { ...d, etapaEfectiva: d.etapa, diasEnEtapa: d.etapa === 'tramitada' ? null : 1 }
  }

  // ── Enrutador ──
  responder(metodo, ruta, query, cuerpo) {
    this.log.push(`${metodo} ${ruta}`)
    const m = (re) => ruta.match(re)
    const quien = this.quien
    const perm = (c) => PERSONAS[quien].permisos.includes(c)

    if (ruta === '/auth/me') return { usuario: this.usuario() }
    if (ruta === '/auth/logout') return { ok: true }

    // ── ausencias ──
    if (ruta === '/ausencias/mias') return { ausencias: this.inc && quien === 'trabajador' ? [this.inc] : [] }
    if (ruta === '/ausencias' && metodo === 'POST') {
      const f = cuerpo.campos
      // Respaldo: si el cuerpo multipart no llega legible, las fechas del ejemplo.
      const ini = (f.fechaInicio || '2027-03-01').slice(0, 10)
      const fin = (f.fechaFin || '2027-03-03').slice(0, 10)
      const dias = Math.round((Date.parse(fin) - Date.parse(ini)) / 86400000) + 1
      this.nuevaIncapacidad({ fechaInicio: dia(ini), fechaFin: dia(fin), dias })
      if (cuerpo.archivo) this.soporte = cuerpo.archivo
      return { _status: 201, ausencia: this.inc }
    }
    if (ruta === '/ausencias/incapacidades/tramite') {
      const i = this.inc
      const r = {}
      if (perm('ausencias:verificar_incapacidades')) r.porVerificar = i && i.etapa === 'en_verificacion' && i.estado === 'pendiente' ? [this.vista(i)] : []
      if (perm('ausencias:foliar_incapacidades')) {
        r.porFoliar = i && i.etapa === 'por_foliar' ? [this.vista(i)] : []
        r.porCompletarFolio = i && ['direccionada', 'tramitada'].includes(i.etapa) && !i.folio.destinatarioRegistrado ? [this.vista(i)] : []
      }
      if (perm('ausencias:direccionar_incapacidades')) r.porDireccionar = i && i.etapa === 'foliada' ? [this.vista(i)] : []
      if (perm('ausencias:recibir_incapacidades')) {
        r.recibidas = i && ['direccionada', 'tramitada'].includes(i.etapa) ? [{ ...this.vista(i), paraMi: true }] : []
      }
      return r
    }
    if (ruta === '/ausencias/incapacidades/destinatarios') return { destinatarios: [{ _id: PERSONAS.th.id, nombre: PERSONAS.th.nombre, cargo: PERSONAS.th.cargo }] }
    if (ruta === '/ausencias/incapacidades/supervision') return this.supervision(query)

    const acc = m(/^\/ausencias\/([^/]+)\/(verificar|devolver|reenviar|foliar|direccionar|completar-folio|tramitar|cancelar)$/)
    if (acc && metodo === 'POST') return this.accion(acc[2], quien, cuerpo)

    if (m(/^\/ausencias\/[^/]+\/soporte/)) return { _soporte: true }

    // ── ruido de fondo que la app consulta al cargar (sin relación con el trámite) ──
    if (ruta === '/tematica') return { modo: 'ninguna' }
    if (ruta === '/plataforma/estado') return { estado: null, mantenimiento: false }
    if (/^\/notificaciones/.test(ruta)) return { notificaciones: [], items: [], total: 0, noLeidas: 0, pendientes: 0 }
    if (/^\/dashboard/.test(ruta)) return {}
    return null
  }

  accion(tipo, clave, c) {
    const i = this.inc
    const b = c.json || {}
    if (!i) return { _status: 404, error: 'Ausencia no encontrada' }
    const f = this.firma(clave)
    const ahora = new Date().toISOString()
    const avanzar = (etapa, accion, nota = '') => { i.etapa = etapa; i.etapaDesde = ahora; i.historial.push(this.paso(accion, clave, nota)) }
    if (tipo === 'verificar') {
      i.estado = 'aprobada'; i.verificacion = { ...f, fecha: ahora, observacion: b.observacion || '' }
      i.decision = { nombreRevisor: f.nombre, cargoRevisor: f.cargo, fecha: ahora, observacion: b.observacion || '' }
      avanzar('por_foliar', 'verificada', b.observacion || '')
    } else if (tipo === 'devolver') avanzar('devuelta', 'devuelta', b.motivo || '')
    else if (tipo === 'reenviar') {
      if (c.archivo) this.soporte = c.archivo
      avanzar('en_verificacion', 'reenviada', [c.campos?.comentario].filter(Boolean).join(''))
    } else if (tipo === 'foliar') {
      i.folio = { numero: b.numeroFolio || '', observacion: b.observacion || '', fecha: ahora, ...f, destinatarioRegistrado: false }
      avanzar('foliada', 'foliada', [b.numeroFolio && `Folio ${b.numeroFolio}`, b.observacion].filter(Boolean).join(': '))
    } else if (tipo === 'direccionar') {
      const d = PERSONAS.th
      i.direccionamiento = { destinatario: { _id: d.id, nombre: d.nombre }, nombreDestinatario: d.nombre, mensaje: b.mensaje || '', fecha: ahora, ...f }
      avanzar('direccionada', 'direccionada', `Dirigida a ${d.nombre}${b.mensaje ? `: ${b.mensaje}` : ''}`)
    } else if (tipo === 'completar-folio') {
      i.folio.destinatarioRegistrado = true
      i.historial.push(this.paso('folio_completado', clave, `Destinatario registrado en el folio: ${i.direccionamiento.nombreDestinatario}`))
    } else if (tipo === 'tramitar') {
      i.tramite = { ...f, fecha: ahora, observacion: b.observacion || '' }
      avanzar('tramitada', 'tramitada', b.observacion || '')
    } else if (tipo === 'cancelar') i.estado = 'cancelada'
    return { ausencia: i }
  }

  // Pantalla de supervisión: la incapacidad de Ana (en la etapa que vaya) y otras de ejemplo.
  supervision() {
    const otra = (id, nombre, cargo, etapa, folio, dias, dest) => ({
      _id: id, tipo: 'incapacidad', estado: 'aprobada', etapa, etapaEfectiva: etapa, diasEnEtapa: dias, fechaInicio: dia('2027-02-22'), fechaFin: dia('2027-02-26'), diasHabiles: 5,
      cargoSolicitante: cargo, dependenciaSolicitante: 'Operaciones', solicitante: { _id: id, nombre, cargo, dependencia: 'Operaciones' },
      soporte: { archivo: 'x.pdf' }, folio: { numero: folio || '', destinatarioRegistrado: etapa === 'tramitada' },
      direccionamiento: dest ? { nombreDestinatario: dest } : {}, historial: [],
    })
    const lista = [
      { ...otra('o1', 'Luis Gómez', 'Conductor', 'en_verificacion', '', 5), estado: 'pendiente' },
      otra('o2', 'Rosa Díaz', 'Aseo', 'foliada', '0460', 1),
      otra('o3', 'Pedro Ríos', 'Seguridad', 'direccionada', '0455', 2, 'Karol Tamayo'),
      this.inc ? this.vista(this.inc) : null,
    ].filter(Boolean)
    const resumen = { total: lista.length, canceladas: 0, sin_tramite: 0 }
    for (const d of lista) resumen[d.etapa] = (resumen[d.etapa] || 0) + 1
    return { incapacidades: lista, resumen }
  }
}
