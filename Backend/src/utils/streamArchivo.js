import fs from 'node:fs'
import path from 'node:path'
import { ErrorNoEncontrado } from './errores.js'

// Envía un archivo ya autorizado por el llamador (el caller ya verificó que
// el usuario puede acceder al recurso al que pertenece este archivo — ver
// ordenes.service.js#obtenerRutaEvidencia y mantenimientos.controller.js).
// Esta función solo se encarga de la parte "insegura" de servir un archivo
// desde disco a partir de un nombre:
//
//  - Rechaza cualquier nombre que no sea un nombre de archivo plano (nada de
//    '/', '\', o '..'), incluso si algún llamador futuro olvidara sanearlo.
//  - Resuelve la ruta final y confirma que sigue DENTRO de `carpetaBase`
//    antes de tocar el filesystem — cierra path traversal por completo, no
//    solo el caso obvio de "../../".
//  - Si el archivo no existe (o el nombre es sospechoso), responde igual que
//    "no encontrado": nunca se distingue "nombre inválido" de "no existe" de
//    "existe pero no es tuyo" — las tres dan el mismo 404 sin más detalle.
export function enviarArchivoSeguro(res, carpetaBase, nombreArchivo) {
  if (
    typeof nombreArchivo !== 'string' ||
    !nombreArchivo ||
    nombreArchivo.includes('/') ||
    nombreArchivo.includes('\\') ||
    nombreArchivo.includes('..')
  ) {
    throw new ErrorNoEncontrado('Archivo no encontrado')
  }

  const base = path.resolve(carpetaBase)
  const destino = path.resolve(base, nombreArchivo)

  if (destino !== path.join(base, nombreArchivo) || (destino !== base && !destino.startsWith(base + path.sep))) {
    throw new ErrorNoEncontrado('Archivo no encontrado')
  }
  if (!fs.existsSync(destino) || !fs.statSync(destino).isFile()) {
    throw new ErrorNoEncontrado('Archivo no encontrado')
  }

  res.sendFile(destino)
}
