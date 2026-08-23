import fs from 'node:fs/promises'
import { fileTypeFromFile } from 'file-type'

// El Content-Type que manda el cliente (file.mimetype, usado hoy en los
// fileFilter de multer) es un dato declarado por el NAVEGADOR, no verificado
// — un cliente puede subir cualquier binario renombrado con la extensión y
// el Content-Type que quiera. multer's fileFilter no puede sniffear el
// contenido real para diskStorage (corre ANTES de que el stream del archivo
// se lea), así que esta verificación va DESPUÉS, ya con el archivo escrito
// en disco: lee su firma real (magic bytes) y, si no corresponde a lo
// declarado, borra el archivo recién subido y rechaza la petición. Ver
// auditoría de producción 2026-08-22, Fase 6.
//
// Firma OLE2 (Compound File Binary): formato de los .doc/.xls "viejos"
// (Office 97-2003). file-type no lo distingue de otros contenedores OLE
// (no hay forma fiable de diferenciar un .doc viejo de un .xls viejo solo
// por la firma), así que se acepta como "documento de Office legado" sin
// más precisión — mejor que no poder validarlo en absoluto.
const FIRMA_OLE2 = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])

async function detectarTipoReal(ruta) {
  const detectado = await fileTypeFromFile(ruta)
  if (detectado) return detectado

  const handle = await fs.open(ruta, 'r')
  try {
    const buffer = Buffer.alloc(8)
    await handle.read(buffer, 0, 8, 0)
    if (buffer.equals(FIRMA_OLE2)) {
      return { mime: 'application/x-ole-legacy', ext: null }
    }
  } finally {
    await handle.close()
  }
  return null
}

// Categorías amplias (no un mimetype exacto): coinciden con el criterio que
// ya usan los fileFilter existentes (esMultimedia por prefijo, MIME_PERMITIDOS
// por lista) — esta función solo confirma que el CONTENIDO real es coherente
// con la categoría declarada, no impone un tipo más estricto que el que el
// propio módulo ya decidió aceptar.
function coincideConCategoria(tipoDetectado, categoria) {
  const mime = tipoDetectado.mime
  switch (categoria) {
    case 'pdf':
      return mime === 'application/pdf'
    case 'imagen':
      return mime.startsWith('image/')
    case 'video':
      return mime.startsWith('video/')
    case 'audio':
      return mime.startsWith('audio/')
    case 'documento':
      return (
        mime === 'application/pdf' ||
        mime === 'application/x-ole-legacy' ||
        mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        // .docx/.xlsx son ZIP por dentro; si file-type no llegó a
        // desambiguar el formato específico de Office, un zip genérico
        // sigue siendo consistente con "documento de Office", a diferencia
        // de un ejecutable o script.
        mime === 'application/zip'
      )
    default:
      return false
  }
}

// Middleware de Express para usar DESPUÉS de multer (necesita req.file ya
// escrito en disco). `categoriaDe(req)` recibe el request y devuelve la
// categoría esperada según el campo/ruta (algunos endpoints aceptan varias
// categorías a la vez, ver evidencias.upload.js).
export function validarContenidoReal(categoriaDe) {
  return async (req, res, next) => {
    if (!req.file) return next()

    try {
      const tipoDetectado = await detectarTipoReal(req.file.path)
      const categorias = categoriaDe(req)
      const ok = tipoDetectado && categorias.some((c) => coincideConCategoria(tipoDetectado, c))

      if (!ok) {
        await fs.unlink(req.file.path).catch(() => {})
        return res.status(400).json({
          error: 'El contenido del archivo no corresponde a un tipo permitido (el Content-Type declarado no coincide con el contenido real).',
        })
      }
      next()
    } catch (err) {
      await fs.unlink(req.file.path).catch(() => {})
      next(err)
    }
  }
}
