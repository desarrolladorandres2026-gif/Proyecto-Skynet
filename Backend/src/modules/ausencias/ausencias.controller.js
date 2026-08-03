import { subirArchivo, cloudinaryConfigurado } from '../../config/cloudinary.js'
import * as service from './ausencias.service.js'

export async function crear(req, res) {
  // `soporte` NUNCA se acepta tal cual del body: si no, cualquiera podría
  // mandar { soporte: { url: 'javascript:...' } } sin adjuntar archivo, y ese
  // enlace quedaría guardado y clicable para quien apruebe (XSS almacenado
  // contra Talento Humano). Solo se arma desde una subida real a Cloudinary.
  const { soporte: _soporteDelCliente, ...datos } = req.body

  if (req.file) {
    if (!cloudinaryConfigurado()) {
      return res.status(503).json({ error: 'El almacenamiento de archivos no está configurado (Cloudinary)' })
    }
    let subida
    try {
      subida = await subirArchivo(req.file.buffer, 'skynet/ausencias')
    } catch (err) {
      console.error('Error subiendo soporte a Cloudinary:', err)
      return res.status(502).json({ error: 'No se pudo subir el soporte, inténtalo de nuevo' })
    }
    datos.soporte = { url: subida.secure_url, publicId: subida.public_id, nombreArchivo: req.file.originalname }
  }

  const ausencia = await service.crearAusencia(datos, req.usuario)
  res.status(201).json({ ausencia })
}

export async function misAusencias(req, res) {
  const ausencias = await service.listarMias(req.usuario)
  res.json({ ausencias })
}

export async function bandeja(_req, res) {
  const ausencias = await service.listarBandeja()
  res.json({ ausencias })
}

export async function listarTodas(req, res) {
  const ausencias = await service.listarTodas({ estado: req.query.estado, tipo: req.query.tipo })
  res.json({ ausencias })
}

export async function calendario(req, res) {
  const ausencias = await service.calendario({ desde: req.query.desde, hasta: req.query.hasta })
  res.json({ ausencias })
}

export async function detalle(req, res) {
  const ausencia = await service.obtenerDetalle(req.params.id, req.usuario)
  res.json({ ausencia })
}

export async function aprobar(req, res) {
  const ausencia = await service.aprobarAusencia(req.params.id, req.body, req.usuario)
  res.json({ ausencia })
}

export async function rechazar(req, res) {
  const ausencia = await service.rechazarAusencia(req.params.id, req.body, req.usuario)
  res.json({ ausencia })
}

export async function cancelar(req, res) {
  const ausencia = await service.cancelarAusencia(req.params.id, req.usuario)
  res.json({ ausencia })
}
