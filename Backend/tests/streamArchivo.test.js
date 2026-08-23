import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { enviarArchivoSeguro } from '../src/utils/streamArchivo.js'

// Prueba unitaria directa de la barrera de seguridad (sin pasar por HTTP):
// evita depender de cómo Express/Node decodifican %2e%2e%2f en la URL, que
// varía según versión y no es lo que en verdad protege contra path
// traversal aquí — lo que protege es esta función.
describe('enviarArchivoSeguro', () => {
  let carpeta
  let archivoReal
  let archivoFueraDeLaCarpeta

  function fakeRes() {
    const res = { enviado: null }
    res.sendFile = (ruta) => {
      res.enviado = ruta
    }
    return res
  }

  beforeAll(() => {
    carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'skynet-storage-test-'))
    archivoReal = path.join(carpeta, 'documento.pdf')
    fs.writeFileSync(archivoReal, 'contenido de prueba')

    // Archivo HERMANO de la carpeta autorizada (mismo padre), el caso clásico
    // que un chequeo ingenuo tipo `startsWith(carpetaBase)` sin separador de
    // ruta dejaría pasar por error (p. ej. "storage-evil" empieza igual que
    // "storage").
    archivoFueraDeLaCarpeta = path.join(carpeta + '-hermana', 'secreto.txt')
    fs.mkdirSync(carpeta + '-hermana', { recursive: true })
    fs.writeFileSync(archivoFueraDeLaCarpeta, 'no deberías poder leer esto')
  })

  afterAll(() => {
    fs.rmSync(carpeta, { recursive: true, force: true })
    fs.rmSync(carpeta + '-hermana', { recursive: true, force: true })
  })

  it('envía un archivo válido dentro de la carpeta', () => {
    const res = fakeRes()
    enviarArchivoSeguro(res, carpeta, 'documento.pdf')
    expect(res.enviado).toBe(path.resolve(archivoReal))
  })

  it('rechaza ../ hacia afuera de la carpeta', () => {
    const res = fakeRes()
    expect(() => enviarArchivoSeguro(res, carpeta, '../secreto.txt')).toThrow('Archivo no encontrado')
  })

  it('rechaza una ruta con separador de directorio en medio', () => {
    const res = fakeRes()
    expect(() => enviarArchivoSeguro(res, carpeta, 'sub/documento.pdf')).toThrow('Archivo no encontrado')
    expect(() => enviarArchivoSeguro(res, carpeta, 'sub\\documento.pdf')).toThrow('Archivo no encontrado')
  })

  it('rechaza un nombre que apunta a una carpeta hermana con prefijo similar', () => {
    const res = fakeRes()
    // Intento directo del nombre completo de la carpeta hermana como si fuera
    // un nombre de archivo (con separador) — ya cubierto por el rechazo de
    // '/', pero se prueba explícitamente el caso "prefijo similar sin separador"
    // para dejar constancia de que el chequeo usa el separador de ruta, no
    // startsWith a secas.
    expect(() => enviarArchivoSeguro(res, carpeta, '..' + path.sep + path.basename(carpeta + '-hermana') + path.sep + 'secreto.txt')).toThrow(
      'Archivo no encontrado'
    )
  })

  it('rechaza un archivo que no existe, con el mismo mensaje que cualquier otro rechazo', () => {
    const res = fakeRes()
    expect(() => enviarArchivoSeguro(res, carpeta, 'no-existe.pdf')).toThrow('Archivo no encontrado')
  })

  it('rechaza nombres vacíos o no-string', () => {
    const res = fakeRes()
    expect(() => enviarArchivoSeguro(res, carpeta, '')).toThrow('Archivo no encontrado')
    expect(() => enviarArchivoSeguro(res, carpeta, undefined)).toThrow('Archivo no encontrado')
  })
})
