// Graba el trámite de una incapacidad usando la interfaz REAL de Skynet:
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
const FOTO1 = path.join(aqui, 'fotos', 'hoja1.jpg')
const FOTO2 = path.join(aqui, 'fotos', 'hoja2.jpg')
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

// Escribe una fecha en un <input type="date"> real; si el teclado no la toma
// (formato del navegador), la fija como lo haría la persona al elegirla.
async function escribirFecha(esc, selector, iso) {
  const el = await esc.tocar(selector, { trasClic: 200 })
  const [a, m, d] = iso.split('-')
  await esc.escribir(`${d}${m}${a}`, { cadaCuantos: 2 })
  const valor = await el.evaluate((n) => n.value)
  if (valor !== iso) {
    await el.evaluate((n, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      set.call(n, v); n.dispatchEvent(new Event('input', { bubbles: true })); n.dispatchEvent(new Event('change', { bubbles: true }))
    }, iso)
    await esc.foto(0.1)
  }
}

async function subirFotos(esc, textoBoton, archivos) {
  const el = await esc.ir(boton(textoBoton, '//div[@role="dialog"]'))
  await esc.cursor(esc.x, esc.y, 0.4); await esc.foto(0.08)
  const [selector] = await Promise.all([esc.p.waitForFileChooser(), el.click()])
  await selector.accept(archivos)
  await esc.cursor(esc.x, esc.y); await esc.foto(0.2)
}

const campoDialogo = (etiqueta, tag = 'input') => xp(enDialogo(`//label[span[contains(normalize-space(.), "${etiqueta}")]]//${tag}`))

// ── Escenas ──
const ESCENAS = {
  async abrir(b, cel) {
    await b.entrar(cel, 'trabajador', '/ausencias/mias')
    const e = new Escena('abrir', cel, 'celular')
    await e.pausa(2)
    await e.tocar(boton('Reportar incapacidad'))
    await e.pausa(1.5)
    return e
  },
  async fechas(b, cel) {
    const e = new Escena('fechas', cel, 'celular')
    await e.pausa(0.6)
    await escribirFecha(e, campoDialogo('Desde'), '2027-03-01')
    await escribirFecha(e, campoDialogo('Hasta'), '2027-03-03')
    await e.pausa(1.2)
    return e
  },
  async foto(b, cel) {
    const e = new Escena('foto', cel, 'celular')
    await e.pausa(1)
    // Primera vez: el trabajador solo fotografía la primera hoja (luego SIG
    // le pedirá la segunda, y así se ve la corrección).
    await subirFotos(e, 'Tomar foto', [FOTO1])
    await e.esperarViendo(xp('//*[contains(normalize-space(.), "PDF listo")]'))
    await e.quitarCursor()
    await e.pausa(1.5)
    // Ver la página procesada en grande
    const miniatura = xp('//button[starts-with(@aria-label, "Ver página")]')
    await e.tocar(miniatura, { trasClic: 500 })
    await e.pausa(3)
    await e.quitarCursor()
    await e.pausa(1)
    return e
  },
  async enviar(b, cel) {
    const e = new Escena('enviar', cel, 'celular')
    await e.pausa(0.8)
    await e.tocar(boton('Enviar solicitud', '//div[@role="dialog"]'), { trasClic: 900 })
    await e.quitarCursor()
    await e.pausa(3)
    return e
  },
  async sig(b) {
    const p = await b.nuevaPagina('escritorio')
    await b.entrar(p, 'sig', '/ausencias/incapacidades')
    const e = new Escena('sig', p, 'escritorio')
    await e.pausa(2)
    // "Ver soporte" abre el PDF en otra pestaña: se captura esa pestaña.
    const enlace = await e.ir(xp('//a[contains(normalize-space(.), "Ver soporte")]'))
    await e.cursor(e.x, e.y, 0.4); await e.foto(0.08)
    const nueva = new Promise((ok) => b.navegador.once('targetcreated', async (t) => ok(await t.page())))
    await enlace.click()
    const pestaña = await nueva
    await pestaña.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 })
    await dormir(900)
    await e.foto(3.2, true, pestaña)
    await pestaña.close()
    await e.pausa(0.6)
    await e.tocar(boton('Devolver'))
    await e.ir(xp(enDialogo('//textarea')))
    await (await e.p.$(xp(enDialogo('//textarea')))).click()
    await e.escribir('Falta la segunda hoja del certificado.', { cadaCuantos: 2 })
    await e.pausa(0.6)
    await e.tocar(xp(enDialogo('//button[@type="submit"]')), { trasClic: 800 })
    await e.quitarCursor()
    await e.pausa(2)
    await p.close()
    return e
  },
  async corregir(b, cel) {
    await b.entrar(cel, 'trabajador', '/ausencias/mias')
    const e = new Escena('corregir', cel, 'celular')
    await e.pausa(2.2)
    await e.tocar(boton('Corregir'))
    await e.pausa(1)
    await subirFotos(e, 'Elegir fotos', [FOTO1, FOTO2])
    await e.esperarViendo(xp('//*[contains(normalize-space(.), "PDF listo: 2 páginas")]'))
    await e.pausa(1)
    await e.tocar(boton('Reenviar a verificación', '//div[@role="dialog"]'), { trasClic: 900 })
    await e.quitarCursor()
    await e.pausa(2)
    return e
  },
  async verificar(b) {
    const p = await b.nuevaPagina('escritorio')
    await b.entrar(p, 'sig', '/ausencias/incapacidades')
    const e = new Escena('verificar', p, 'escritorio')
    await e.pausa(1.2)
    await e.tocar(boton('Verificar y aprobar'))
    await (await e.ir(xp(enDialogo('//textarea')))).click()
    await e.escribir('Soporte completo y legible.', { cadaCuantos: 2 })
    await e.tocar(xp(enDialogo('//button[@type="submit"]')), { trasClic: 800 })
    await e.quitarCursor()
    await e.pausa(2)
    await p.close()
    return e
  },
  async aprobada(b, cel) {
    await b.entrar(cel, 'trabajador', '/ausencias/mias')
    const e = new Escena('aprobada', cel, 'celular')
    await e.pausa(4)
    return e
  },
  async secretaria(b) {
    const p = await b.nuevaPagina('escritorio')
    await b.entrar(p, 'secretaria', '/ausencias/incapacidades')
    const e = new Escena('secretaria', p, 'escritorio')
    await e.pausa(2)
    await e.tocar(boton('Foliar'))
    await e.ir(campoDialogo('Número de folio')); await (await e.p.$(campoDialogo('Número de folio'))).click()
    await e.escribir('0457')
    await (await e.ir(xp(enDialogo('//textarea')))).click()
    await e.escribir('Incapacidad EPS, 2 hojas.', { cadaCuantos: 2 })
    await e.tocar(xp(enDialogo('//button[@type="submit"]')), { trasClic: 800 })
    await e.quitarCursor()
    await e.pausa(2.5)
    await p.close()
    return e
  },
  async gerencia(b) {
    const p = await b.nuevaPagina('escritorio')
    await b.entrar(p, 'gerencia', '/ausencias/incapacidades')
    const e = new Escena('gerencia', p, 'escritorio')
    await e.pausa(1.8)
    await e.tocar(boton('Direccionar'))
    const lista = xp(enDialogo('//select'))
    await e.tocar(lista, { trasClic: 300 })
    await p.select('div[role="dialog"] select', 'u-th')
    await e.pausa(1)
    await (await e.ir(xp(enDialogo('//textarea')))).click()
    await e.escribir('Para trámite de nómina y reconocimiento ante la EPS.', { cadaCuantos: 3 })
    await e.tocar(xp(enDialogo('//button[@type="submit"]')), { trasClic: 800 })
    await e.quitarCursor()
    await e.pausa(2)
    await p.close()
    return e
  },
  async folio(b) {
    const p = await b.nuevaPagina('escritorio')
    await b.entrar(p, 'secretaria', '/ausencias/incapacidades')
    const e = new Escena('folio', p, 'escritorio')
    await e.pausa(2.2)
    await e.tocar(boton('Registrar en el folio'))
    await e.pausa(1.5)
    await e.tocar(xp(enDialogo('//button[@type="submit"]')), { trasClic: 800 })
    await e.quitarCursor()
    await e.pausa(2)
    await p.close()
    return e
  },
  async th(b) {
    const p = await b.nuevaPagina('escritorio')
    await b.entrar(p, 'th', '/ausencias/incapacidades')
    const e = new Escena('th', p, 'escritorio')
    await e.pausa(2.5)
    await e.tocar(boton('Marcar tramitada'))
    await (await e.ir(xp(enDialogo('//textarea')))).click()
    await e.escribir('Radicada ante la EPS.', { cadaCuantos: 2 })
    await e.tocar(xp(enDialogo('//button[@type="submit"]')), { trasClic: 800 })
    await e.quitarCursor()
    await e.pausa(2)
    await p.close()
    return e
  },
  async tramitada(b, cel) {
    await b.entrar(cel, 'trabajador', '/ausencias/mias')
    const e = new Escena('tramitada', cel, 'celular')
    await e.pausa(4)
    return e
  },
  async supervision(b) {
    const p = await b.nuevaPagina('escritorio')
    await b.entrar(p, 'gerencia', '/ausencias/incapacidades/supervision')
    const e = new Escena('supervision', p, 'escritorio')
    await e.pausa(3)
    await e.tocar(xp('//tr[.//*[contains(normalize-space(.), "Ana Pérez")]]//button[contains(normalize-space(.), "Ver")]'), { trasClic: 700 })
    await e.quitarCursor()
    await e.pausa(4)
    await p.close()
    return e
  },
}

const b = await abrirNavegador({ dist: DIST, imagenSoporte: FOTO1 })
const cel = await b.nuevaPagina('celular')
try {
  for (const [id, fn] of Object.entries(ESCENAS)) {
    // Las escenas dependen del estado de las anteriores: se ejecutan todas,
    // pero solo se guardan las pedidas con --solo.
    const e = await fn(b, cel)
    if (!SOLO || SOLO.includes(id)) e.guardar()
  }
} finally {
  if (b.api.desconocidas.size) console.log('Consultas sin respuesta de ejemplo:', [...b.api.desconocidas].join(' | '))
  await b.cerrar()
}
