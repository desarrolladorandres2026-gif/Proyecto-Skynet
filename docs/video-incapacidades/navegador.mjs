// Abre la app REAL de Skynet en Chrome (sin interfaz) con la API de ejemplo
// conectada, y permite entrar como cada rol del trámite.
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
import { ApiFalsa } from './api-falsa.mjs'
import { servirDist } from './servidor.mjs'

export const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p))

export const VISTAS = {
  celular: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  escritorio: { width: 1280, height: 800, deviceScaleFactor: 1.5 },
}

// Campos de texto de un multipart (los archivos solo se marcan como presentes).
function leerMultipart(cuerpo, tipo) {
  const borde = /boundary=(.+)$/.exec(tipo || '')?.[1]
  const campos = {}
  let archivo = null
  if (!borde || !cuerpo) return { campos, archivo }
  for (const parte of cuerpo.split(`--${borde}`)) {
    const nombre = /name="([^"]+)"/.exec(parte)?.[1]
    if (!nombre) continue
    if (/filename="/.test(parte)) { archivo = { nombre: /filename="([^"]*)"/.exec(parte)[1] }; continue }
    campos[nombre] = parte.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '')
  }
  return { campos, archivo }
}

export async function abrirNavegador({ dist, imagenSoporte }) {
  const { srv, puerto } = await servirDist(dist)
  const api = new ApiFalsa()
  const navegador = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--hide-scrollbars', '--lang=es-CO', '--font-render-hinting=none'],
  })
  const base = `http://127.0.0.1:${puerto}`

  async function nuevaPagina(vista) {
    const p = await navegador.newPage()
    await p.setBypassServiceWorker(true)
    await p.emulateTimezone('America/Bogota')
    await p.setExtraHTTPHeaders({ 'Accept-Language': 'es-CO,es;q=0.9' })
    await p.setViewport(VISTAS[vista])
    await p.setRequestInterception(true)
    p.on('request', async (req) => {
      const url = new URL(req.url())
      if (!url.pathname.startsWith('/api/')) return req.continue()
      const ruta = url.pathname.slice(4)
      const tipo = req.headers()['content-type'] || ''
      // Con archivos adjuntos postData() viene vacío: se pide el cuerpo completo.
      let datos = req.postData()
      if (!datos && req.hasPostData?.()) datos = await req.fetchPostData().catch(() => undefined)
      const cuerpo = tipo.startsWith('multipart/') ? leerMultipart(datos, tipo) : { json: datos ? JSON.parse(datos) : {} }
      const r = api.responder(req.method(), ruta, Object.fromEntries(url.searchParams), cuerpo)
      if (r?._soporte) return req.respond({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(imagenSoporte) })
      if (r === null) api.desconocidas.add(`${req.method()} ${ruta}`)
      const { _status = 200, ...json } = r || {}
      req.respond({ status: _status, contentType: 'application/json', body: JSON.stringify(json) })
    })
    return p
  }

  // Entra como `quien` en `ruta`, con la sesión ya iniciada.
  async function entrar(pagina, quien, ruta) {
    api.quien = quien
    await pagina.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
    await pagina.evaluate((u) => {
      localStorage.clear(); sessionStorage.clear()
      localStorage.setItem('skynet_usuario', JSON.stringify(u))
      // Avisos de primera vez que no son parte de lo que se explica (mismas
      // claves que usa la app: legal/CookieConsent.jsx y pwa/*).
      localStorage.setItem('skynet_cookies_consentimiento', JSON.stringify({ aceptado: true, version: '1', fecha: new Date().toISOString() }))
      localStorage.setItem('pwa-instalacion-descartada', String(Date.now()))
      sessionStorage.setItem('push-onboarding-descartado', '1')
      // Sin decoración de temporada: el video no debe quedar con luces de Navidad.
      localStorage.setItem('skynet-tematica-modo', 'ninguna')
    }, api.usuario(quien))
    await pagina.goto(`${base}${ruta}`, { waitUntil: 'networkidle0' })
  }

  return { api, navegador, nuevaPagina, entrar, base, cerrar: async () => { await navegador.close(); srv.close() } }
}
