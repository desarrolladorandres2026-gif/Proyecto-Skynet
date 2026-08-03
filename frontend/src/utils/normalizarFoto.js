// Normaliza cualquier foto elegida (cámara o galería) a JPEG antes de subirla.
//
// Por qué: la galería de iPhone guarda las fotos en HEIC — Safari lo puede
// decodificar (es su propio códec, vía createImageBitmap/<canvas>) pero
// Cloudinary y el resto del pipeline (subirImagen, ver
// Backend/src/config/cloudinary.js) esperan un formato estándar. De paso
// esto limita el lado máximo del lado más largo, evitando fotos de decenas
// de megapíxeles que algunos límites de Cloudinary rechazan.
//
// Si algo falla (formato no decodificable, navegador sin soporte de canvas,
// o una foto de iCloud "Optimizar almacenamiento" que Safari no llega a
// descargar a tiempo) se hace fallback silencioso al archivo original: mejor
// intentar subir tal cual que bloquear al usuario con un error de conversión.

const CALIDAD_JPEG = 0.85
const LADO_MAXIMO_PX = 1920

export async function normalizarFoto(file) {
  if (!file || !file.type.startsWith('image/')) return file

  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = calcularDimensiones(bitmap.width, bitmap.height, LADO_MAXIMO_PX)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', CALIDAD_JPEG))
    if (!blob) return file

    const nombre = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], nombre, { type: 'image/jpeg' })
  } catch {
    return file
  }
}

// TODO(usuario): calcula el ancho/alto de salida preservando la proporción
// original, de forma que ni el ancho ni el alto superen `ladoMaximo`. Si la
// imagen ya es más chica que ladoMaximo en ambas dimensiones, no la agrandes
// (subir la resolución no gana nitidez, solo peso).
//
// Parámetros: anchoOriginal, altoOriginal, ladoMaximo (todos en px, > 0)
// Retorna: { width, height } — enteros, redondeados.
function calcularDimensiones(anchoOriginal, altoOriginal, ladoMaximo) {
  // ...
}
