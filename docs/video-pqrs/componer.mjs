// Arma el video final a partir de lo grabado con grabar.mjs:
//  - un fondo por escena (barra de pasos, marco del celular o de la ventana y
//    el texto explicativo), dibujado con Chrome a 1920x1080;
//  - encima, los cuadros REALES de la app, cada uno el tiempo que le toca;
//  - la duración de cada escena la manda su voz (narracion/*.wav).
//
//   node componer.mjs  →  video-pqrs.mp4
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import ffmpeg from 'ffmpeg-static'
import { CHROME } from './navegador.mjs'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const FPS = 25
const W = 1920, H = 1080
const GRAB = path.join(aqui, 'grabacion')
const TMP = path.join(aqui, 'grabacion', '_video')
fs.mkdirSync(TMP, { recursive: true })

// Dónde va la pantalla real dentro del cuadro final.
const PANTALLA = {
  celular: { x: 382, y: 150, w: 416, h: 900 },
  escritorio: { x: 40, y: 214, w: 1160, h: 725 },
}

const ACTORES = ['Recibir', 'Revisar', 'Responder', 'Constancia']
// Qué explica cada escena. actor: índice en ACTORES, 'todos' o null.
const ESCENAS = {
  intro: { full: 'intro' },
  resumen: { full: 'resumen' },
  bandeja: { actor: 0, tag: 'Sitio web · Solicitudes', titulo: 'Llega la solicitud', lineas: ['PQRSF, contacto y denuncias del sitio web', 'Las nuevas aparecen "Sin leer"', 'Skynet avisa al equipo'] },
  abrir: { actor: 1, tag: 'Gestión de radicado', titulo: 'Abrir y revisar', lineas: ['Toca "Gestionar"', 'Se marca "Leído" sola', 'Toda la información del ciudadano'] },
  estado: { actor: 1, tag: 'Gestión de radicado', titulo: 'Estado del trámite', lineas: ['Recibido, En revisión o Resuelto', 'Es el mismo que ve el ciudadano', 'Se puede cambiar en cualquier momento'] },
  responder: { actor: 2, tag: 'Gestión de radicado', titulo: 'Respuesta oficial', lineas: ['Escribe el texto (y un PDF si hace falta)', 'Es pública: sin datos sensibles', '"Publicar respuesta" la envía por correo y la marca Resuelta'] },
  constancia: { actor: 3, tag: 'Gestión de radicado', titulo: 'Constancia de envío', lineas: ['Quién respondió y cuándo', 'Si el correo salió bien', 'Reenviar con un clic si falló'] },
  formato: { actor: 3, tag: 'Gestión de radicado', titulo: 'Formato PQRSDF', lineas: ['Prellenado con la solicitud y tus datos', 'Corriges lo que haga falta', 'Descargas y firmas sobre la impresión'] },
  cierre: { full: 'cierre', actor: 'todos' },
}

// ── duración de cada escena a partir de su voz ──
function duracionWav(archivo) {
  const b = fs.readFileSync(archivo)
  let p = 12, byteRate = 0
  while (p < b.length - 8) {
    const id = b.toString('ascii', p, p + 4), len = b.readUInt32LE(p + 4)
    if (id === 'fmt ') byteRate = b.readUInt32LE(p + 16)
    if (id === 'data') return Math.min(len, b.length - p - 8) / byteRate
    p += 8 + len + (len % 2)
  }
  throw new Error(`WAV inválido: ${archivo}`)
}
const guion = JSON.parse(fs.readFileSync(path.join(aqui, 'guion.json'), 'utf8'))
let t = 0
const plan = guion.map((g, i) => {
  const wav = path.join(aqui, 'narracion', `${String(i + 1).padStart(2, '0')}-${g.id}.wav`)
  const voz = duracionWav(wav)
  const dur = Math.max(3.5, 0.4 + voz + 0.9)
  const e = { id: g.id, wav, inicio: t, vozInicio: t + 0.4, dur }
  t += dur
  return e
})
console.log(`Duración total: ${t.toFixed(1)} s`)

// ── fondos ──
const CSS = `
*{box-sizing:border-box} body{margin:0;font-family:'Segoe UI',system-ui,sans-serif;color:#0f172a}
.st{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:linear-gradient(135deg,#eaf4fb 0%,#f8fafc 55%,#e3eff8 100%)}
.bar{position:absolute;left:0;right:0;top:0;height:120px;display:flex;align-items:center;justify-content:center}
.node{display:flex;align-items:center}
.chip{display:flex;align-items:center;gap:12px;padding:9px 22px 9px 9px;border-radius:999px;background:#fff;border:3px solid #e2e8f0;color:#64748b;font-weight:600;font-size:22px}
.chip i{width:42px;height:42px;border-radius:50%;background:#e2e8f0;color:#64748b;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:20px;font-weight:700}
.chip.on{border-color:#0072b5;color:#005f98;box-shadow:0 6px 20px rgba(0,114,181,.25)} .chip.on i{background:#0072b5;color:#fff}
.chip.done{border-color:#b7d79b;color:#467a22} .chip.done i{background:#467a22;color:#fff}
.link{width:38px;height:4px;background:#e2e8f0} .link.done{background:#9ccb73}
.cap{position:absolute;left:1250px;top:200px;width:630px}
.tag{display:inline-block;padding:7px 18px;border-radius:999px;background:#0072b5;color:#fff;font-weight:700;font-size:21px}
.cap h1{font-size:52px;line-height:1.12;margin:18px 0 26px}
.ln{font-size:31px;line-height:1.3;margin:0 0 18px;display:flex;gap:14px} .ln:before{content:'✓';color:#467a22;font-weight:800}
.tel{position:absolute;border:16px solid #0f172a;border-radius:58px;background:#0f172a;box-shadow:0 30px 60px rgba(15,23,42,.35)}
.ven{position:absolute;border-radius:14px;background:#e2e8f0;box-shadow:0 30px 60px rgba(15,23,42,.3);border:1px solid #cbd5e1}
.ven .b{height:44px;display:flex;align-items:center;gap:9px;padding:0 18px} .ven .b i{width:14px;height:14px;border-radius:50%;background:#94a3b8}
.big{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 120px}
.big h1{font-size:86px;margin:18px 0 14px;line-height:1.08} .big p{font-size:38px;color:#334155;margin:0}
.logo{font-size:46px;font-weight:800;letter-spacing:6px;color:#0072b5}
.flow{display:flex;align-items:flex-start;gap:10px;margin-top:56px}
.fn{width:330px;text-align:center} .fn .ic{width:120px;height:120px;margin:0 auto 18px;border-radius:50%;background:#fff;border:4px solid #0072b5;display:flex;align-items:center;justify-content:center;font-size:56px;box-shadow:0 10px 26px rgba(0,114,181,.2)}
.fn b{display:block;font-size:31px} .fn span{font-size:24px;color:#475569;line-height:1.3;display:block;margin-top:6px}
.fa{font-size:50px;color:#0072b5;margin-top:36px}
.sum{text-align:left;margin-top:40px} .sum div{font-size:42px;margin:18px 0;display:flex;gap:20px;align-items:center} .sum i{width:58px;height:58px;border-radius:50%;background:#467a22;color:#fff;font-style:normal;display:flex;align-items:center;justify-content:center;font-size:32px}`

function barra(actor, previo) {
  return `<div class="bar">${ACTORES.map((n, i) => {
    const e = actor === 'todos' ? 'done' : i === actor ? 'on' : i <= previo ? 'done' : ''
    const l = i < ACTORES.length - 1 ? `<div class="link ${actor === 'todos' || i < previo ? 'done' : ''}"></div>` : ''
    return `<div class="node"><div class="chip ${e}"><i>${e === 'done' ? '✓' : i + 1}</i>${n}</div>${l}</div>`
  }).join('')}</div>`
}

function fondoHtml(id, previo, tipo) {
  const e = ESCENAS[id]
  if (e.full === 'intro') return `<div class="st"><div class="big"><div class="logo">SKYNET</div><h1>Cómo tramitar una PQRS</h1><p>Desde la bandeja de Skynet hasta la respuesta al ciudadano</p></div></div>`
  if (e.full === 'resumen') {
    const N = [['📥', 'Recibir', 'La solicitud llega del sitio web'], ['🔎', 'Revisar', 'Se abre y se marca en revisión'], ['✉️', 'Responder', 'Respuesta oficial pública y por correo'], ['🧾', 'Constancia', 'Queda quién, cuándo y si llegó']]
    return `<div class="st"><div class="big"><h1 style="font-size:68px">Un proceso, cuatro momentos</h1><div class="flow">${N.map(([ic, n, d], i) => `<div style="display:flex"><div class="fn"><div class="ic">${ic}</div><b>${n}</b><span>${d}</span></div>${i < 3 ? '<div class="fa">➜</div>' : ''}</div>`).join('')}</div></div></div>`
  }
  if (e.full === 'cierre') {
    const P = ['La solicitud llega y se avisa al equipo', 'Se abre y se revisa', 'Se publica la respuesta oficial', 'Queda la constancia del envío']
    return `<div class="st">${barra('todos', 3)}<div class="big" style="padding-top:60px"><h1 style="font-size:66px">Cada solicitud, atendida y con constancia</h1><div class="sum">${P.map((p) => `<div><i>✓</i>${p}</div>`).join('')}</div></div></div>`
  }
  const r = PANTALLA[tipo]
  const marco = tipo === 'celular'
    ? `<div class="tel" style="left:${r.x - 16}px;top:${r.y - 16}px;width:${r.w + 32}px;height:${r.h + 32}px"></div>`
    : `<div class="ven" style="left:${r.x - 1}px;top:${r.y - 45}px;width:${r.w + 2}px;height:${r.h + 46}px"><div class="b"><i></i><i></i><i></i></div></div>`
  return `<div class="st">${barra(e.actor, previo)}${marco}<div class="cap"><span class="tag">${e.tag}</span><h1>${e.titulo}</h1>${e.lineas.map((l) => `<div class="ln">${l}</div>`).join('')}</div></div>`
}

const nav = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const pg = await nav.newPage()
await pg.setViewport({ width: W, height: H })
let previo = -1
for (const e of plan) {
  const info = fs.existsSync(path.join(GRAB, e.id, 'cuadros.json')) ? JSON.parse(fs.readFileSync(path.join(GRAB, e.id, 'cuadros.json'), 'utf8')) : null
  e.info = info
  await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${fondoHtml(e.id, previo, info?.tipo)}</body></html>`)
  e.fondo = path.join(TMP, `fondo-${e.id}.png`)
  await pg.screenshot({ path: e.fondo })
  const a = ESCENAS[e.id].actor
  if (typeof a === 'number') previo = Math.max(previo, a)
}
await nav.close()

// ── cada escena a MP4 ──
function correr(args) {
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`ffmpeg falló (${r.status})`)
}
for (const e of plan) {
  e.mp4 = path.join(TMP, `escena-${e.id}.mp4`)
  const comun = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-t', e.dur.toFixed(3)]
  if (!e.info) { correr(['-loop', '1', '-framerate', String(FPS), '-i', e.fondo, ...comun, e.mp4]); continue }
  // Duración de cada cuadro: los normales tal cual; las pausas se estiran para
  // llenar lo que dura la voz. Si no alcanza, todo se comprime por igual.
  const c = e.info.cuadros
  const fijo = c.filter((x) => !x.flex).reduce((s, x) => s + x.peso, 0)
  const flex = c.filter((x) => x.flex).reduce((s, x) => s + x.peso, 0)
  let factorFlex = 1, factorTodo = 1
  if (fijo + flex <= e.dur) factorFlex = flex ? (e.dur - fijo) / flex : 1
  else factorTodo = e.dur / (fijo + flex)
  const lista = c.map((x) => `file '${path.join(GRAB, e.id, x.archivo).replace(/\\/g, '/')}'\nduration ${(x.peso * (x.flex ? factorFlex : 1) * factorTodo).toFixed(4)}`)
  lista.push(`file '${path.join(GRAB, e.id, c[c.length - 1].archivo).replace(/\\/g, '/')}'`)
  const listaArchivo = path.join(TMP, `lista-${e.id}.txt`)
  fs.writeFileSync(listaArchivo, lista.join('\n'))
  const r = PANTALLA[e.info.tipo]
  correr([
    '-loop', '1', '-framerate', String(FPS), '-i', e.fondo,
    '-f', 'concat', '-safe', '0', '-i', listaArchivo,
    '-filter_complex', `[1:v]scale=${r.w}:${r.h}:flags=lanczos,setsar=1,fps=${FPS}[app];[0:v][app]overlay=${r.x}:${r.y}:eof_action=repeat[v]`,
    '-map', '[v]', ...comun, e.mp4,
  ])
  console.log(`  ${e.id}: ${e.dur.toFixed(1)} s`)
}

// ── unir escenas y voz ──
const listaEscenas = path.join(TMP, 'escenas.txt')
fs.writeFileSync(listaEscenas, plan.map((e) => `file '${e.mp4.replace(/\\/g, '/')}'`).join('\n'))
const sinVoz = path.join(TMP, 'sin-voz.mp4')
correr(['-f', 'concat', '-safe', '0', '-i', listaEscenas, '-c', 'copy', sinVoz])
const filtros = plan.map((e, i) => `[${i + 1}:a]adelay=${Math.round(e.vozInicio * 1000)}:all=1[a${i}]`).join(';')
const mezcla = `${plan.map((_, i) => `[a${i}]`).join('')}amix=inputs=${plan.length}:normalize=0:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100[aout]`
const SALIDA = path.join(aqui, 'video-pqrs.mp4')
correr(['-i', sinVoz, ...plan.flatMap((e) => ['-i', e.wav]), '-filter_complex', `${filtros};${mezcla}`, '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', t.toFixed(2), '-movflags', '+faststart', SALIDA])
console.log(`Listo: ${SALIDA} (${(fs.statSync(SALIDA).size / 1048576).toFixed(1)} MB, ${t.toFixed(0)} s)`)
