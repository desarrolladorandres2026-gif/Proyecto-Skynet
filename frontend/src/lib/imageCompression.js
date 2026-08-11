import imageCompression from 'browser-image-compression'

// Cloudinary ya reduce las imágenes en el servidor (resize + quality: auto),
// pero comprimir en el navegador ANTES de subir ahorra datos móviles y
// acelera la subida, que es lo que más se siente en campo (fotos de daños,
// evidencias de mantenimiento, firmas) con señal débil.
const OPCIONES_DEFECTO = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  initialQuality: 0.8,
}

// SVG no se puede recomprimir como raster: se sube tal cual.
const TIPOS_NO_COMPRIMIBLES = new Set(['image/svg+xml', 'image/gif'])

// Comprime un File si es una imagen rasterizable; cualquier otro tipo
// (PDF, video, audio, SVG) se devuelve sin tocar.
export async function comprimirSiEsImagen(file, opciones = {}) {
  if (!(file instanceof File) || !file.type?.startsWith('image/')) return file
  if (TIPOS_NO_COMPRIMIBLES.has(file.type)) return file

  try {
    const comprimido = await imageCompression(file, { ...OPCIONES_DEFECTO, ...opciones })
    // Si la compresión no logró reducir el peso (ya venía optimizada),
    // conservamos el original para no perder calidad de balde.
    if (comprimido.size >= file.size) return file
    return new File([comprimido], file.name, {
      type: comprimido.type || file.type,
      lastModified: Date.now(),
    })
  } catch (err) {
    console.warn('No se pudo comprimir la imagen, se sube el archivo original:', err)
    return file
  }
}

// Variante para arreglos/FileList de imágenes (p. ej. evidencias múltiples).
export async function comprimirImagenes(files, opciones = {}) {
  return Promise.all(Array.from(files ?? []).map((f) => comprimirSiEsImagen(f, opciones)))
}
