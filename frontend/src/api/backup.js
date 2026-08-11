import { request } from './client.js'

async function descargarArchivo(path, nombrePorDefecto) {
  const BASE = import.meta.env.VITE_API_URL || '/api'
  const res = await fetch(`${BASE}${path}`, { credentials: 'include' })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error || `Error ${res.status}`)
  }
  const blob = await res.blob()
  const nombreCabecera = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
  return { blob, nombre: nombreCabecera || nombrePorDefecto }
}

export const backup = {
  exportar() {
    return descargarArchivo('/backup/exportar', 'skynet-backup.xlsx')
  },
  listarColecciones() {
    return request('/backup/colecciones')
  },
  exportarPersonalizado({ colecciones, desde, hasta, formato } = {}) {
    const params = new URLSearchParams()
    if (colecciones?.length) params.set('colecciones', colecciones.join(','))
    if (desde) params.set('desde', desde)
    if (hasta) params.set('hasta', hasta)
    if (formato) params.set('formato', formato)
    const qs = params.toString()
    const extension = formato === 'csv' ? 'zip' : formato === 'json' ? 'json' : 'xlsx'
    return descargarArchivo(`/backup/exportar${qs ? `?${qs}` : ''}`, `skynet-backup.${extension}`)
  },
  previsualizarPurga(meses) {
    return request(`/backup/purga/previsualizar?meses=${meses}`)
  },
  rescatarPurga(meses) {
    return descargarArchivo(`/backup/purga/rescate?meses=${meses}`, `skynet-rescate-${meses}m.xlsx`)
  },
  purgar(meses, password) {
    return request('/backup/purga', {
      method: 'DELETE',
      body: JSON.stringify({ meses, password }),
    })
  },
}
