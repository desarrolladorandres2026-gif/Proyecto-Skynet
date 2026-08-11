import JSZip from 'jszip'
import { requerimientos as requerimientosApi } from '../api/requerimientos.js'
import { construirPdfRequerimiento, nombreArchivoPdfRequerimiento } from './requerimientoPdf.js'

// "Finales": aprobados por Financiero Y despachados por Bodega — estado raíz
// pendiente_bodega (ya pasó Financiero) + bodega.estado === 'aprobada'
// (Bodega ya despachó). Deja afuera los rechazados, los que Bodega marcó
// "no se puede despachar" y los que siguen pendientes en cualquier bandeja:
// esos documentos todavía pueden cambiar, no son el registro final del
// trámite. A pedido explícito del usuario (2026-08-11): "solo quiero los
// finales que ya han sido aprobados y despachados".
function esFinal(req) {
  return req.estado === 'pendiente_bodega' && req.bodega?.estado === 'aprobada'
}

// Reutiliza construirPdfRequerimiento (el mismo dibujado que usa la
// descarga individual en RequerimientoDetallePage/BandejaBodegaPage) en vez
// de duplicar el formato: cada PDF se genera igual, solo que en vez de
// pdf.save() se empaqueta en un único .zip para no disparar N descargas.
export async function descargarPdfsRequerimientosFinalizados({ onProgreso } = {}) {
  const { requerimientos: lista } = await requerimientosApi.listarTodos({ estado: 'pendiente_bodega' })
  const finales = lista.filter(esFinal)

  if (finales.length === 0) {
    return { total: 0 }
  }

  const zip = new JSZip()
  for (let i = 0; i < finales.length; i++) {
    const req = finales[i]
    onProgreso?.(i + 1, finales.length)
    const pdf = await construirPdfRequerimiento(req)
    zip.file(nombreArchivoPdfRequerimiento(req), pdf.output('arraybuffer'))
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `requerimientos-aprobados-despachados-${new Date().toISOString().slice(0, 10)}.zip`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)

  return { total: finales.length }
}
