import * as service from './purga.service.js'

export async function previsualizar(req, res) {
  const resultado = await service.previsualizarPurga(req.query.meses)
  res.json(resultado)
}

export async function rescatar(req, res) {
  const buffer = await service.generarRescateExcel(req.query.meses)
  const fecha = new Date().toISOString().slice(0, 10)
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="skynet-rescate-${req.query.meses}m-${fecha}.xlsx"`,
  })
  res.send(buffer)
}

export async function purgar(req, res) {
  const resultado = await service.purgarAntiguos(req.body, req.usuario)
  res.json(resultado)
}
