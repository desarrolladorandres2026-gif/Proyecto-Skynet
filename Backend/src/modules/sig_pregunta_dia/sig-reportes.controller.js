import * as dashboardService from './sig-dashboard.service.js'
import * as excelService from './sig-excel.service.js'

function filtrosDesdeQuery(query) {
  return {
    desde: query.desde,
    hasta: query.hasta,
    dependencia: query.dependencia,
    cargo: query.cargo,
    componenteSig: query.componenteSig,
    tema: query.tema,
    resultado: query.resultado,
  }
}

export async function dashboard(req, res) {
  const resultado = await dashboardService.obtenerDashboard(filtrosDesdeQuery(req.query))
  res.json(resultado)
}

export async function trabajadoresParticipantes(_req, res) {
  const trabajadores = await dashboardService.listarTrabajadoresParticipantes()
  res.json({ trabajadores })
}

export async function reporteTrabajador(req, res) {
  const resultado = await dashboardService.reporteTrabajador(req.params.usuarioId, filtrosDesdeQuery(req.query))
  res.json(resultado)
}

export async function planRefuerzo(req, res) {
  const planes = await dashboardService.recalcularYObtenerPlanRefuerzo(filtrosDesdeQuery(req.query))
  res.json({ planes })
}

export async function exportar(req, res) {
  const { buffer, total } = await excelService.exportarRespuestas(filtrosDesdeQuery(req.query))
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="pregunta-sig-respuestas-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    'X-Total-Exportado': String(total),
    'Access-Control-Expose-Headers': 'X-Total-Exportado, Content-Disposition',
  })
  res.send(buffer)
}
