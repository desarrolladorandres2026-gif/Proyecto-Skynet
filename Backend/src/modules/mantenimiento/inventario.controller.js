import * as service from './inventario.service.js'

export async function buscar(req, res) {
  const materiales = await service.buscarMateriales(req.query.q)
  res.json({ materiales })
}

export async function crear(req, res) {
  const material = await service.crearMaterial(req.body, req.usuario)
  res.status(201).json({ material })
}

export async function ajustar(req, res) {
  const material = await service.ajustarStock(req.params.materialId, req.body, req.usuario)
  res.json({ material })
}

export async function consumir(req, res) {
  const { material, orden } = await service.consumirParaOrden(req.params.id, req.body, req.usuario)
  res.status(201).json({ material, orden })
}

export async function devolver(req, res) {
  const material = await service.devolverAInventario(req.params.id, req.body, req.usuario)
  res.json({ material })
}

export async function desperdicio(req, res) {
  const material = await service.registrarDesperdicio(req.params.id, req.body, req.usuario)
  res.json({ material })
}
