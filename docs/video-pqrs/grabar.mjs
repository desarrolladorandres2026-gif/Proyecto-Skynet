// Graba el flujo de una PQRS usando la interfaz REAL de Skynet:
// abre el frontend construido, entra como cada rol y hace los clics y la
// escritura de verdad. Guarda los fotogramas de cada escena en grabacion/<id>/.
//
//   node grabar.mjs --dist <carpeta del vite build>  [--solo sig,verificar]
//
// Cada fotograma lleva un "peso" (cuánto dura en pantalla). Los marcados como
// pausa (flex) se estiran luego para que la escena dure lo que dura su voz.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { abrirNavegador } from './navegador.mjs'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1] }
const DIST = arg('dist')
if (!DIST) throw new Error('Indica --dist con la carpeta del frontend construido (vite build)')
const SOLO = arg('solo') ? arg('solo').split(',') : null
const FOTO1 = path.join(aqui, '..', 'video-incapacidades', 'fotos', 'hoja1.jpg')
const SALIDA = path.join(aqui, 'grabacion')

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const xp = (expr) => `::-p-xpath(${expr})`
const enDialogo = (expr) => `//div[@role="dialog"]${expr}`
const boton = (texto, dentro = '') => xp(`${dentro}//button[contains(normalize-space(.), "${texto}")]`)

// ── Grabador de una escena ──
class Escena {
  constructor(id, pagina, tipo) {
    this.id = id; this.p = pagina; this.tipo = tipo; this.cuadros = []
    this.dir = path.join(SALIDA, id)
    fs.rmSync(this.dir, { recursive: true, force: true })
    fs.mkdirSync(this.dir, { recursive: true })
    this.x = null; this.y = null
  }

  async foto(peso, flex = false, pagina = this.p) {
    const archivo = path.join(this.dir, `${String(this.cuadros.length).padStart(4, '0')}.jpg`)
    await pagina.screenshot({ path: archivo, type: 'jpeg', quality: 90 })
    this.cuadros.push({ archivo: path.basename(archivo), peso, flex })
  }
  pausa(seg) { return this.foto(seg, true) }

  // Cursor (o dedo, en el celular) dibujado sobre la página real.
  async cursor(x, y, toque = 0) {
    await this.p.evaluate((x, y, tipo, toque) => {
      let c = document.getElementById('__cursor')
      if (!c) {
        c = document.createElement('div'); c.id = '__cursor'
        c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none'
        document.body.appendChild(c)
      }
      const anillo = toque > 0 ? `<div style="position:absolute;left:${-10 - 22 * toque}px;top:${-10 - 22 * toque}px;width:${20 + 44 * toque}px;height:${20 + 44 * toque}px;border-radius:50%;border:3px solid rgba(0,114,181,${1 - toque})"></div>` : ''
      c.innerHTML = tipo === 'celular'
        ? `<div style="position:absolute;left:-19px;top:-19px;width:38px;height:38px;border-radius:50%;background:rgba(0,114,181,.32);border:2px solid rgba(0,114,181,.85)"></div>${anillo}`
        : `<svg width="30" height="30" viewBox="0 0 24 24" style="position:absolute;left:-3px;top:-2px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))"><path d="M3 2l7 19 3-8 8-3z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>${anillo}`
      c.style.transform = `translate(${x}px,${y}px)`
    }, x, y, this.tipo, toque)
  }
  async quitarCursor() { await this.p.evaluate(() => document.getElementById('__cursor')?.remove()) }

  async buscar(selector) {
    const el = await this.p.waitForSelector(selector, { visible: true, timeout: 15000 })
    await el.evaluate((n) => n.scrollIntoView({ block: 'center', behavior: 'instant' }))
    await dormir(120)
    return el
  }

  // Mueve el cursor hasta el elemento (con varios cuadros intermedios).
  async ir(selector) {
    const el = await this.buscar(selector)
    const caja = await el.boundingBox()
    const tx = caja.x + caja.width / 2, ty = caja.y + caja.height / 2
    const vp = this.p.viewport()
    if (this.x === null) { this.x = vp.width * 0.72; this.y = vp.height * 0.82 }
    const pasos = 9
    for (let i = 1; i <= pasos; i++) {
      const k = i / pasos, e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      await this.cursor(this.x + (tx - this.x) * e, this.y + (ty - this.y) * e)
      await this.foto(0.05)
    }
    this.x = tx; this.y = ty
    return el
  }

  async tocar(selector, { trasClic = 600 } = {}) {
    const el = await this.ir(selector)
    await this.cursor(this.x, this.y, 0.25); await this.foto(0.08)
    await el.click()
    await this.cursor(this.x, this.y, 0.7); await this.foto(0.08)
    await dormir(trasClic)
    await this.cursor(this.x, this.y); await this.foto(0.25)
    return el
  }

  async escribir(texto, { cadaCuantos = 1 } = {}) {
    for (let i = 0; i < texto.length; i++) {
      await this.p.keyboard.type(texto[i])
      if (i % cadaCuantos === cadaCuantos - 1 || i === texto.length - 1) await this.foto(0.06)
    }
  }

  // Captura mientras la app trabaja, hasta que aparezca `listo`.
  async esperarViendo(selector, maxSeg = 20) {
    const fin = Date.now() + maxSeg * 1000
    while (Date.now() < fin) {
      await this.foto(0.3)
      if (await this.p.$(selector)) return
      await dormir(250)
    }
    throw new Error(`No apareció ${selector}`)
  }

  guardar() {
    fs.writeFileSync(path.join(this.dir, 'cuadros.json'), JSON.stringify({ id: this.id, tipo: this.tipo, cuadros: this.cuadros }, null, 1))
    console.log(`  ${this.id}: ${this.cuadros.length} cuadros`)
  }
}


const CODIGO = 'TTN-2027-0120'

let panel

// ── Escenas ──
const ESCENAS = {
  async bandeja(b) {
    // Llega una solicitud nueva desde el sitio web (queda sin leer).
    b.api.radicar({ tipo: 'Queja', nombre: 'Ana Pérez', correo: 'ana.perez@ejemplo.test', asunto: 'Demora en la atención de la taquilla', texto: 'El pasado sábado esperé más de 40 minutos para comprar un tiquete y nadie me dio razón de la demora.' })
    panel = await b.nuevaPagina('escritorio')
    await b.entrar(panel, 'operador', '/sitio-web/radicados')
    const e = new Escena('bandeja', panel, 'escritorio')
    await e.pausa(4.5)
    return e
  },
  async abrir(b) {
    const e = new Escena('abrir', panel, 'escritorio')
    await e.pausa(0.8)
    await e.tocar(xp(`//tr[.//*[contains(normalize-space(.), "${CODIGO}")]]//button[contains(normalize-space(.), "Gestionar")]`), { trasClic: 1200 })
    await e.quitarCursor()
    await e.pausa(4)
    return e
  },
  async estado(b) {
    const e = new Escena('estado', panel, 'escritorio')
    await e.pausa(0.8)
    await e.ir(xp('//*[@role="radiogroup"]//button[contains(normalize-space(.), "En revisión")]'))
    await e.foto(1.2)
    await e.ir(xp('//*[@role="radiogroup"]//button[contains(normalize-space(.), "Resuelto")]'))
    await e.foto(1.5)
    await e.quitarCursor()
    await e.pausa(2)
    return e
  },
  async responder(b) {
    const e = new Escena('responder', panel, 'escritorio')
    await e.pausa(0.8)
    await (await e.ir('textarea')).click()
    await e.escribir('Lamentamos la demora. Ya reforzamos el personal de taquilla en horas pico y trasladamos su caso al área de Operaciones. Gracias por ayudarnos a mejorar.', { cadaCuantos: 6 })
    await e.pausa(2)
    await e.tocar(xp('//button[contains(normalize-space(.), "Publicar respuesta")]'), { trasClic: 1000 })
    await e.quitarCursor()
    await e.pausa(2)
    return e
  },
  async constancia(b) {
    const e = new Escena('constancia', panel, 'escritorio')
    await e.pausa(0.5)
    await e.ir(xp('//p[contains(normalize-space(.), "Enviada por correo a")]'))
    await e.quitarCursor()
    await e.pausa(5)
    return e
  },
  async formato(b) {
    const e = new Escena('formato', panel, 'escritorio')
    await e.pausa(0.8)
    await e.tocar(xp('//button[contains(normalize-space(.), "Formato PQRSDF")]'), { trasClic: 900 })
    await e.quitarCursor()
    await e.pausa(5)
    return e
  },
}

const b = await abrirNavegador({ dist: DIST, imagenSoporte: FOTO1 })
try {
  for (const [id, fn] of Object.entries(ESCENAS)) {
    const e = await fn(b)
    if (!SOLO || SOLO.includes(id)) e.guardar()
  }
} finally {
  if (b.api.desconocidas.size) console.log('Consultas sin respuesta de ejemplo:', [...b.api.desconocidas].join(' | '))
  await b.cerrar()
}
