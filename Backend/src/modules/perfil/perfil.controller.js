import Usuario from '../../models/Usuario.js'
import Requerimiento from '../../models/Requerimiento.js'
import { subirFirma, urlFirmaProcesada, eliminarImagen, cloudinaryConfigurado } from '../../config/cloudinary.js'

// Datos que el usuario administra sobre sí mismo, sin pasar por el módulo de
// gestión de Usuarios (que es de administración y exige permisos). Hoy solo
// la firma manuscrita; es el lugar natural para lo que venga después (foto de
// perfil, preferencias personales).

// Lo que se le devuelve al frontend: nunca el publicId (detalle interno de
// Cloudinary, no le sirve al cliente para nada).
function firmaPublica(firma) {
  if (!firma?.url) return null
  return { url: firma.url, urlOriginal: firma.urlOriginal, actualizadaEn: firma.actualizadaEn }
}

// Un asset de Cloudinary referenciado por un requerimiento ya firmado NO se
// puede destruir: rompería la rúbrica de un documento cerrado, que por diseño
// no debe cambiar nunca (mismo criterio que los snapshots de nombre/cargo en
// Requerimiento.js). En ese caso solo se desvincula del usuario y el asset
// queda vivo sirviendo a los documentos históricos.
async function borrarAssetSiNadieLoUsa(publicId) {
  if (!publicId) return
  const enUso = await Requerimiento.exists({ 'financiero.firma.publicId': publicId })
  if (enUso) return
  try {
    await eliminarImagen(publicId)
  } catch (err) {
    // Dejar un asset huérfano en Cloudinary (~20 KB) es preferible a fallar la
    // operación que el usuario sí pidió: reemplazar o borrar su firma.
    console.error('No se pudo eliminar la firma de Cloudinary:', publicId, err.message)
  }
}

// Endpoint propio en vez de incluir la firma en /auth/me: el usuario de
// /auth/me se cachea en localStorage para pintar la UI al instante (ver
// api/client.js) y quedaría desactualizado justo después de subir una firma.
export async function obtenerFirma(req, res) {
  const usuario = await Usuario.findById(req.usuario.id_usuario).select('firma')
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })
  res.json({ firma: firmaPublica(usuario.firma) })
}

export async function guardarFirma(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Debes adjuntar una imagen de tu firma' })
  }
  if (!cloudinaryConfigurado()) {
    return res.status(503).json({ error: 'El almacenamiento de imágenes no está configurado (Cloudinary)' })
  }

  const usuario = await Usuario.findById(req.usuario.id_usuario)
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })

  let subida
  try {
    subida = await subirFirma(req.file.buffer)
  } catch (err) {
    console.error('Error subiendo la firma a Cloudinary:', err)
    return res.status(502).json({ error: 'No se pudo subir la firma, inténtalo de nuevo' })
  }

  const anterior = usuario.firma?.publicId

  usuario.firma = {
    url: urlFirmaProcesada(subida.public_id),
    urlOriginal: subida.secure_url,
    publicId: subida.public_id,
    actualizadaEn: new Date(),
  }
  await usuario.save()

  // Después de guardar la nueva: si la limpieza falla, el usuario ya tiene su
  // firma nueva y lo único que queda es un archivo de sobra.
  if (anterior && anterior !== subida.public_id) await borrarAssetSiNadieLoUsa(anterior)

  res.json({ firma: firmaPublica(usuario.firma) })
}

export async function eliminarFirma(req, res) {
  const usuario = await Usuario.findById(req.usuario.id_usuario)
  if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' })
  if (!usuario.firma?.publicId) {
    return res.status(400).json({ error: 'No tienes una firma registrada' })
  }

  const publicId = usuario.firma.publicId
  usuario.firma = undefined
  await usuario.save()
  await borrarAssetSiNadieLoUsa(publicId)

  res.json({ firma: null })
}
