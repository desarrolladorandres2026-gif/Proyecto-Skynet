import * as service from './sig-banco.service.js'

export async function crear(req, res) {
  const pregunta = await service.crearPregunta(req.body, req.usuario)
  res.status(201).json({ pregunta })
}

export async function listar(req, res) {
  const preguntas = await service.listarBanco({
    estado: req.query.estado,
    componenteSig: req.query.componenteSig,
    tema: req.query.tema,
    texto: req.query.texto,
    etiqueta: req.query.etiqueta,
  })
  res.json({ preguntas })
}

export async function detalle(req, res) {
  const pregunta = await service.obtenerPregunta(req.params.id)
  res.json({ pregunta })
}

export async function editar(req, res) {
  const pregunta = await service.editarPregunta(req.params.id, req.body, req.usuario)
  res.json({ pregunta })
}

export async function archivar(req, res) {
  const pregunta = await service.archivarPregunta(req.params.id, req.body.archivar !== false, req.usuario)
  res.json({ pregunta })
}

export async function eliminar(req, res) {
  const resultado = await service.eliminarPregunta(req.params.id, req.usuario)
  res.json(resultado)
}
