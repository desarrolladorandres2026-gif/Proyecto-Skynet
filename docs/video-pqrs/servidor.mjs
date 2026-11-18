// Sirve el frontend ya construido (vite build) con salida SPA: cualquier ruta
// que no sea un archivo devuelve index.html. Las consultas a /api las responde
// el navegador de grabación con la API de ejemplo (api-falsa.mjs), no este servidor.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf' }

export function servirDist(carpetaDada, puerto = 0) {
  // path.resolve normaliza las barras: sin esto, en Windows "C:/..." nunca es
  // prefijo de "C:\..." y todo caería en index.html.
  const carpeta = path.resolve(carpetaDada)
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    let archivo = path.join(carpeta, decodeURIComponent(url.pathname))
    if (!archivo.startsWith(carpeta) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) archivo = path.join(carpeta, 'index.html')
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' })
    fs.createReadStream(archivo).pipe(res)
  })
  return new Promise((ok) => srv.listen(puerto, '127.0.0.1', () => ok({ srv, puerto: srv.address().port })))
}
