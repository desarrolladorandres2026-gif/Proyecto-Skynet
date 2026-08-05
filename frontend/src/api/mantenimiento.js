import { request } from './client.js'

export const mantenimientoApi = {
  panel() {
    return request('/mantenimiento/panel')
  },

  catalogos: {
    obtener() {
      return request('/mantenimiento/catalogos')
    },
    agregar(tipo, nombre) {
      return request('/mantenimiento/catalogos/agregar', {
        method: 'POST',
        body: JSON.stringify({ tipo, nombre }),
      })
    },
    eliminar(tipo, id) {
      return request('/mantenimiento/catalogos/eliminar', {
        method: 'POST',
        body: JSON.stringify({ tipo, id }),
      })
    },
  },

  equipos: {
    listar({ page = 1, q = '' } = {}) {
      const p = new URLSearchParams({ page })
      if (q) p.set('q', q)
      return request(`/mantenimiento/equipos?${p}`)
    },
    obtener(id) {
      return request(`/mantenimiento/equipos/${id}`)
    },
    ficha(id) {
      return request(`/mantenimiento/equipos/${id}/ficha`)
    },
    crear(datos) {
      return request('/mantenimiento/equipos', { method: 'POST', body: JSON.stringify(datos) })
    },
    actualizar(id, datos) {
      return request(`/mantenimiento/equipos/${id}`, { method: 'PUT', body: JSON.stringify(datos) })
    },
    eliminar(id) {
      return request(`/mantenimiento/equipos/${id}`, { method: 'DELETE' })
    },
    registrarMantenimientoConPdf(equipoId, datos, file) {
      const form = new FormData()
      Object.entries(datos).forEach(([k, v]) => form.append(k, v))
      if (file) form.append('archivo_mantenimiento', file)
      return request(`/mantenimiento/equipos/${equipoId}/mantenimiento`, { method: 'POST', body: form })
    },
  },

  mantenimientos: {
    pendientes() {
      return request('/mantenimiento/mantenimientos/pendientes')
    },
    finalizados() {
      return request('/mantenimiento/mantenimientos/finalizados')
    },
    proximos() {
      return request('/mantenimiento/mantenimientos/proximos')
    },
    programados({ page = 1, busqueda = '' } = {}) {
      const p = new URLSearchParams({ page })
      if (busqueda) p.set('busqueda', busqueda)
      return request(`/mantenimiento/mantenimientos/programados?${p}`)
    },
    programar(datos) {
      return request('/mantenimiento/mantenimientos/programar', { method: 'POST', body: JSON.stringify(datos) })
    },
    registrarRealizado(datos) {
      return request('/mantenimiento/mantenimientos/registrar-realizado', {
        method: 'POST',
        body: JSON.stringify(datos),
      })
    },
    editar(id, datos) {
      return request(`/mantenimiento/mantenimientos/${id}/editar`, { method: 'POST', body: JSON.stringify(datos) })
    },
    finalizar(id) {
      return request(`/mantenimiento/mantenimientos/${id}/finalizar`, { method: 'POST' })
    },
    subirPdf(mantenimientoId, file) {
      const form = new FormData()
      form.append('pdf_file', file)
      return request(`/mantenimiento/mantenimientos/${mantenimientoId}/subir_pdf`, { method: 'POST', body: form })
    },
    eliminar(id) {
      return request(`/mantenimiento/mantenimientos/${id}`, { method: 'DELETE' })
    },
    agregarInforme(id, file) {
      const form = new FormData()
      form.append('archivo_informe', file)
      return request(`/mantenimiento/mantenimientos/${id}/agregar_informe`, { method: 'POST', body: form })
    },
  },
}

// Ciclo de vida de la Orden de Trabajo (CMMS Fase 1). Router propio en
// /mantenimiento/ordenes, separado del legado de arriba — ver
// Backend/src/modules/mantenimiento/ordenes.routes.js.
export const ordenesApi = {
  listar({ estado = '', page = 1 } = {}) {
    const p = new URLSearchParams({ page })
    if (estado) p.set('estado', estado)
    return request(`/mantenimiento/ordenes?${p}`)
  },
  obtener(id) {
    return request(`/mantenimiento/ordenes/${id}`)
  },
  tecnicos() {
    return request('/mantenimiento/ordenes/tecnicos')
  },
  reportar(datos) {
    return request('/mantenimiento/ordenes', { method: 'POST', body: JSON.stringify(datos) })
  },
  programar(datos) {
    return request('/mantenimiento/ordenes/programar', { method: 'POST', body: JSON.stringify(datos) })
  },
  asignar(id, tecnicoId) {
    return request(`/mantenimiento/ordenes/${id}/asignar`, { method: 'POST', body: JSON.stringify({ tecnicoId }) })
  },
  aceptar(id) {
    return request(`/mantenimiento/ordenes/${id}/aceptar`, { method: 'POST' })
  },
  rechazar(id, motivo) {
    return request(`/mantenimiento/ordenes/${id}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo }) })
  },
  pausar(id, motivo_espera) {
    return request(`/mantenimiento/ordenes/${id}/pausar`, { method: 'POST', body: JSON.stringify({ motivo_espera }) })
  },
  reanudar(id) {
    return request(`/mantenimiento/ordenes/${id}/reanudar`, { method: 'POST' })
  },
  // foto (File) es opcional: si viene, se manda multipart; si no, JSON plano.
  resolver(id, descripcion_solucion, foto) {
    if (foto) {
      const fd = new FormData()
      fd.append('descripcion_solucion', descripcion_solucion)
      fd.append('foto', foto)
      return request(`/mantenimiento/ordenes/${id}/resolver`, { method: 'POST', body: fd })
    }
    return request(`/mantenimiento/ordenes/${id}/resolver`, { method: 'POST', body: JSON.stringify({ descripcion_solucion }) })
  },
  aprobar(id, comentario) {
    return request(`/mantenimiento/ordenes/${id}/aprobar`, { method: 'POST', body: JSON.stringify({ comentario }) })
  },
  rechazarCierre(id, comentario) {
    return request(`/mantenimiento/ordenes/${id}/rechazar_cierre`, { method: 'POST', body: JSON.stringify({ comentario }) })
  },
  reabrir(id, motivo) {
    return request(`/mantenimiento/ordenes/${id}/reabrir`, { method: 'POST', body: JSON.stringify({ motivo }) })
  },
  cancelar(id, motivo) {
    return request(`/mantenimiento/ordenes/${id}/cancelar`, { method: 'POST', body: JSON.stringify({ motivo }) })
  },
  escalar(id, motivo, destino) {
    return request(`/mantenimiento/ordenes/${id}/escalar`, { method: 'POST', body: JSON.stringify({ motivo, destino }) })
  },

  // Ejecución técnica (CMMS Fase 3)
  registrarLlegada(id, datos, foto) {
    const form = new FormData()
    Object.entries(datos).forEach(([k, v]) => { if (v !== undefined && v !== '') form.append(k, v) })
    if (foto) form.append('foto', foto)
    return request(`/mantenimiento/ordenes/${id}/llegada`, { method: 'POST', body: form })
  },
  iniciarInspeccion(id) {
    return request(`/mantenimiento/ordenes/${id}/inspeccion`, { method: 'POST' })
  },
  registrarDiagnostico(id, datos) {
    return request(`/mantenimiento/ordenes/${id}/diagnostico`, { method: 'POST', body: JSON.stringify(datos) })
  },
  registrarMaterial(id, datos) {
    return request(`/mantenimiento/ordenes/${id}/materiales`, { method: 'POST', body: JSON.stringify(datos) })
  },
  registrarHerramienta(id, datos) {
    return request(`/mantenimiento/ordenes/${id}/herramientas`, { method: 'POST', body: JSON.stringify(datos) })
  },
  registrarHoras(id, datos) {
    return request(`/mantenimiento/ordenes/${id}/horas`, { method: 'POST', body: JSON.stringify(datos) })
  },
  agregarEvidencia(id, { tipo, momento, comentario }, archivo) {
    const form = new FormData()
    form.append('tipo', tipo)
    if (momento) form.append('momento', momento)
    if (comentario) form.append('comentario', comentario)
    form.append('archivo', archivo)
    return request(`/mantenimiento/ordenes/${id}/evidencias`, { method: 'POST', body: form })
  },

  // Sub-flujo de repuestos
  solicitarRepuestos(id, datos) {
    return request(`/mantenimiento/ordenes/${id}/repuestos`, { method: 'POST', body: JSON.stringify(datos) })
  },
  aprobarRepuestos(id, solicitudId) {
    return request(`/mantenimiento/ordenes/${id}/repuestos/${solicitudId}/aprobar`, { method: 'POST' })
  },
  rechazarRepuestos(id, solicitudId, motivo) {
    return request(`/mantenimiento/ordenes/${id}/repuestos/${solicitudId}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo }) })
  },
  entregarRepuestos(id, solicitudId) {
    return request(`/mantenimiento/ordenes/${id}/repuestos/${solicitudId}/entregar`, { method: 'POST' })
  },
  instalarRepuestos(id, solicitudId) {
    return request(`/mantenimiento/ordenes/${id}/repuestos/${solicitudId}/instalar`, { method: 'POST' })
  },

  // Apoyo entre técnicos
  invitarApoyo(id, tecnicoId, motivo) {
    return request(`/mantenimiento/ordenes/${id}/apoyo`, { method: 'POST', body: JSON.stringify({ tecnicoId, motivo }) })
  },
  aceptarApoyo(id, invitacionId) {
    return request(`/mantenimiento/ordenes/${id}/apoyo/${invitacionId}/aceptar`, { method: 'POST' })
  },
  rechazarApoyo(id, invitacionId) {
    return request(`/mantenimiento/ordenes/${id}/apoyo/${invitacionId}/rechazar`, { method: 'POST' })
  },
}

// Hallazgos (CMMS Fase 3): siempre en el contexto de una OT.
export const hallazgosApi = {
  listarDeOrden(otId) {
    return request(`/mantenimiento/ordenes/${otId}/hallazgos`)
  },
  registrar(otId, datos) {
    return request(`/mantenimiento/ordenes/${otId}/hallazgos`, { method: 'POST', body: JSON.stringify(datos) })
  },
  agregarEvidencia(hallazgoId, comentario, archivo) {
    const form = new FormData()
    if (comentario) form.append('comentario', comentario)
    form.append('archivo', archivo)
    return request(`/mantenimiento/ordenes/hallazgos/${hallazgoId}/evidencias`, { method: 'POST', body: form })
  },
  marcarSeguimiento(hallazgoId) {
    return request(`/mantenimiento/ordenes/hallazgos/${hallazgoId}/seguimiento`, { method: 'POST' })
  },
  marcarResuelto(hallazgoId) {
    return request(`/mantenimiento/ordenes/hallazgos/${hallazgoId}/resolver`, { method: 'POST' })
  },
  aceptarRiesgo(hallazgoId, justificacion, reevaluarEn) {
    return request(`/mantenimiento/ordenes/hallazgos/${hallazgoId}/aceptar_riesgo`, { method: 'POST', body: JSON.stringify({ justificacion, reevaluarEn }) })
  },
  convertir(hallazgoId) {
    return request(`/mantenimiento/ordenes/hallazgos/${hallazgoId}/convertir`, { method: 'POST' })
  },
}

// Bitácora Operativa (Work Log, CMMS Fase 3.1) — independiente del Timeline.
export const bitacoraApi = {
  listar(otId, filtros = {}) {
    const p = new URLSearchParams(filtros)
    return request(`/mantenimiento/ordenes/${otId}/bitacora?${p}`)
  },
  agregar(otId, datos, archivo) {
    const form = new FormData()
    Object.entries(datos).forEach(([k, v]) => { if (v) form.append(k, v) })
    if (archivo) form.append('adjunto', archivo)
    return request(`/mantenimiento/ordenes/${otId}/bitacora`, { method: 'POST', body: form })
  },
}

// Checklists inteligentes / Plantillas de mantenimiento (Fase 3.1).
export const plantillasApi = {
  listar(tipoEquipo) {
    const p = new URLSearchParams(tipoEquipo ? { tipoEquipo } : {})
    return request(`/mantenimiento/ordenes/plantillas?${p}`)
  },
  crear(datos) {
    return request('/mantenimiento/ordenes/plantillas', { method: 'POST', body: JSON.stringify(datos) })
  },
  aplicar(otId, plantillaId) {
    return request(`/mantenimiento/ordenes/${otId}/plantilla`, { method: 'POST', body: JSON.stringify({ plantillaId }) })
  },
  marcarItem(otId, itemId, datos) {
    return request(`/mantenimiento/ordenes/${otId}/checklist/${itemId}`, { method: 'POST', body: JSON.stringify(datos) })
  },
}

// Inventario de repuestos (Fase 3.1).
export const inventarioApi = {
  buscar(q) {
    const p = new URLSearchParams(q ? { q } : {})
    return request(`/mantenimiento/ordenes/inventario/materiales?${p}`)
  },
  consumir(otId, materialId, cantidad) {
    return request(`/mantenimiento/ordenes/${otId}/inventario/consumir`, { method: 'POST', body: JSON.stringify({ materialId, cantidad }) })
  },
  crear(datos) {
    return request('/mantenimiento/ordenes/inventario/materiales', { method: 'POST', body: JSON.stringify(datos) })
  },
  ajustar(materialId, cantidad, motivo) {
    return request(`/mantenimiento/ordenes/inventario/materiales/${materialId}/ajustar`, { method: 'POST', body: JSON.stringify({ cantidad, motivo }) })
  },
}

// Base de Conocimiento (Fase 3.1).
export const conocimientoApi = {
  buscar(q) {
    const p = new URLSearchParams(q ? { q } : {})
    return request(`/mantenimiento/ordenes/conocimiento?${p}`)
  },
  convertir(otId, datos) {
    return request(`/mantenimiento/ordenes/${otId}/conocimiento`, { method: 'POST', body: JSON.stringify(datos) })
  },
  vincular(articuloId, otId) {
    return request(`/mantenimiento/ordenes/conocimiento/${articuloId}/vincular`, { method: 'POST', body: JSON.stringify({ otId }) })
  },
}

// Comunicación interna (Fase 3.1): canales 'interno' / 'solicitante'.
export const mensajesApi = {
  listar(otId, canal) {
    return request(`/mantenimiento/ordenes/${otId}/mensajes?canal=${canal}`)
  },
  enviar(otId, canal, texto) {
    return request(`/mantenimiento/ordenes/${otId}/mensajes`, { method: 'POST', body: JSON.stringify({ canal, texto }) })
  },
}

// Indicadores personales y seguimiento en tiempo real (Fase 3.1).
export const indicadoresApi = {
  mios(filtros = {}) {
    const p = new URLSearchParams(filtros)
    return request(`/mantenimiento/ordenes/indicadores?${p}`)
  },
}

export const seguimientoApi = {
  tecnicos() {
    return request('/mantenimiento/ordenes/seguimiento')
  },
}

// Módulo del Supervisor (CMMS Fase 4).
export const supervisorApi = {
  centroControl() {
    return request('/mantenimiento/ordenes/supervisor/centro-control')
  },
  sugerirTecnico(otId) {
    return request(`/mantenimiento/ordenes/${otId}/sugerir-tecnico`)
  },
  reasignar(otId, tecnicoId) {
    return request(`/mantenimiento/ordenes/${otId}/reasignar`, { method: 'POST', body: JSON.stringify({ tecnicoId }) })
  },
  balanceCarga() {
    return request('/mantenimiento/ordenes/supervisor/balance-carga')
  },
  reasignarLote(otIds, tecnicoId) {
    return request('/mantenimiento/ordenes/supervisor/reasignar-lote', { method: 'POST', body: JSON.stringify({ otIds, tecnicoId }) })
  },
  aprobaciones() {
    return request('/mantenimiento/ordenes/supervisor/aprobaciones')
  },
  calendario(filtros = {}) {
    const p = new URLSearchParams(filtros)
    return request(`/mantenimiento/ordenes/supervisor/calendario?${p}`)
  },
  sla() {
    return request('/mantenimiento/ordenes/supervisor/sla')
  },
  centroHallazgos(filtros = {}) {
    const p = new URLSearchParams(filtros)
    return request(`/mantenimiento/ordenes/supervisor/centro-hallazgos?${p}`)
  },
  activosProblematicos() {
    return request('/mantenimiento/ordenes/supervisor/activos-problematicos')
  },
  fichaActivo(equipoId) {
    return request(`/mantenimiento/ordenes/supervisor/activos/${equipoId}`)
  },
  actualizarActivo(equipoId, datos) {
    return request(`/mantenimiento/ordenes/supervisor/activos/${equipoId}`, { method: 'POST', body: JSON.stringify(datos) })
  },
  alertas() {
    return request('/mantenimiento/ordenes/supervisor/alertas')
  },
  dashboard(filtros = {}) {
    const p = new URLSearchParams(filtros)
    return request(`/mantenimiento/ordenes/supervisor/dashboard?${p}`)
  },
}
