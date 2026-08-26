import { CARPETA_SOPORTES } from './ausencias.upload.js'
import * as service from './ausencias.service.js'
import { ErrorNoEncontrado } from '../../utils/errores.js'
import { enviarArchivoSeguro } from '../../utils/streamArchivo.js'

export async function crear(req, res) {
  // `soporte` NUNCA se acepta tal cual del body: si no, cualquiera podría
  // mandar { soporte: { url: 'javascript:...' } } sin adjuntar archivo, y ese
  // enlace quedaría guardado y clicable para quien apruebe (XSS almacenado
  // contra Talento Humano). Solo se arma desde un archivo subido y validado.
  const { soporte: _soporteDelCliente, ...datos } = req.body

  if (req.file) {
    datos.soporte = {
      archivo: req.file.filename,
      nombreArchivo: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
    }
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

export async function soporte(req, res) {
  const { id, nombreArchivo } = req.params
  const doc = await service.obtenerDetalle(id, req.usuario)

  if (!doc.soporte || (!doc.soporte.archivo && !doc.soporte.url)) {
    throw new ErrorNoEncontrado('La ausencia no tiene soporte adjunto')
  }

  // Soporte almacenado en disco local del servidor
  if (doc.soporte.archivo) {
    if (nombreArchivo && nombreArchivo !== doc.soporte.archivo) {
      throw new ErrorNoEncontrado('Archivo no encontrado')
    }
    const nombreDescarga = doc.soporte.nombreArchivo || doc.soporte.archivo
    if (doc.soporte.mimetype) {
      res.setHeader('Content-Type', doc.soporte.mimetype)
    }
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nombreDescarga)}"`)
    return enviarArchivoSeguro(res, CARPETA_SOPORTES, doc.soporte.archivo)
  }

  // Retrocompatibilidad con soportes históricos que se subieron a Cloudinary
  if (doc.soporte.url?.startsWith('https://')) {
    return res.redirect(doc.soporte.url)
  }

  throw new ErrorNoEncontrado('Archivo no encontrado')
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
