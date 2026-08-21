import * as service from './sig-banco.service.js'
import * as importacion from './sig-importacion.service.js'

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

// Carga masiva desde Excel. Devuelve 201 aunque haya filas rechazadas: la
// importación es parcial por diseño (ver sig-importacion.service.js), así que
// el "éxito" es haber procesado el archivo, y el detalle de qué entró, qué se
// omitió por duplicado y qué falló viaja en el cuerpo para que la UI lo
// muestre fila por fila.
export async function importarExcel(req, res) {
  const resultado = await importacion.importarPreguntasDesdeExcel(req.file?.buffer, req.usuario)
  res.status(201).json(resultado)
}

export async function plantillaExcel(_req, res) {
  const buffer = await importacion.generarPlantillaExcel()
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="plantilla-preguntas-sig.xlsx"',
    'Access-Control-Expose-Headers': 'Content-Disposition',
  })
  res.send(Buffer.from(buffer))
}
