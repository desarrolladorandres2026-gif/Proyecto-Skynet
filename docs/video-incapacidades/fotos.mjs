// Genera dos "fotos de celular" de un certificado de incapacidad FICTICIO: la
// hoja un poco girada y en perspectiva sobre una mesa, con sombra, como la
// tomaría una persona. Son las que se le dan al escáner real de Skynet en el
// video. Ningún dato es real.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { CHROME } from './navegador.mjs'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const carpeta = path.join(aqui, 'fotos')
fs.mkdirSync(carpeta, { recursive: true })

const hoja = (n) => `
<div style="font-family:Arial,sans-serif;color:#1f2937;padding:60px 64px;font-size:22px;line-height:1.5">
  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #0f5132;padding-bottom:16px">
    <div><div style="font-size:34px;font-weight:800;color:#0f5132">EPS SALUD EJEMPLO</div><div style="font-size:18px;color:#475569">Documento de ejemplo · no válido</div></div>
    <div style="width:92px;height:92px;border-radius:50%;border:6px solid #0f5132;display:flex;align-items:center;justify-content:center;font-weight:800;color:#0f5132;font-size:26px">EPS</div>
  </div>
  ${n === 1 ? `
  <h1 style="text-align:center;font-size:32px;margin:34px 0 26px">CERTIFICADO DE INCAPACIDAD</h1>
  <p><b>Paciente:</b> Ana Pérez</p>
  <p><b>Documento:</b> CC 0.000.000.000 (ejemplo)</p>
  <p><b>Tipo:</b> Enfermedad general · Incapacidad inicial</p>
  <p><b>Fecha de inicio:</b> 01/03/2027 &nbsp;&nbsp; <b>Fecha de fin:</b> 03/03/2027</p>
  <p><b>Días de incapacidad:</b> 3 (tres)</p>
  <p style="margin-top:26px">Se certifica que el paciente requiere reposo durante el periodo indicado, según valoración médica realizada en la fecha de inicio.</p>
  <div style="margin-top:70px;display:flex;justify-content:space-between;align-items:flex-end">
    <div><div style="font-family:'Segoe Script','Brush Script MT',cursive;font-size:40px;color:#1e3a8a">Dr. Ejemplo</div><div style="border-top:2px solid #334155;width:300px;padding-top:6px;font-size:18px">Médico tratante · Reg. 00000</div></div>
    <div style="width:150px;height:150px;border-radius:50%;border:5px solid rgba(159,18,57,.7);color:rgba(159,18,57,.8);display:flex;align-items:center;justify-content:center;text-align:center;font-weight:800;font-size:18px;transform:rotate(-12deg)">SELLO<br>EPS</div>
  </div>` : `
  <h1 style="text-align:center;font-size:30px;margin:34px 0 26px">RECOMENDACIONES · HOJA 2 DE 2</h1>
  <p>1. Reposo en casa durante el periodo de la incapacidad.</p>
  <p>2. Hidratación abundante y alimentación balanceada.</p>
  <p>3. Control con medicina general si los síntomas persisten.</p>
  <p>4. Presentar este certificado completo ante el empleador.</p>
  <p style="margin-top:26px">Este documento hace parte del certificado de incapacidad emitido en la misma fecha.</p>
  <div style="margin-top:90px;border-top:2px solid #334155;width:300px;padding-top:6px;font-size:18px">Firma y sello del médico</div>`}
  <div style="position:absolute;bottom:40px;left:64px;right:64px;font-size:16px;color:#64748b;border-top:1px solid #cbd5e1;padding-top:10px">Página ${n} de 2</div>
</div>`

const escena = (n, giro, inclinacion) => `<!doctype html><html><body style="margin:0">
<div style="width:1200px;height:1600px;position:relative;overflow:hidden;background:
  radial-gradient(ellipse at 30% 20%, #6b5b4b 0%, #3f342a 55%, #241d17 100%)">
  <div style="position:absolute;inset:0;background:repeating-linear-gradient(93deg,rgba(255,255,255,.025) 0 6px,rgba(0,0,0,.03) 6px 14px)"></div>
  <div style="position:absolute;left:170px;top:190px;width:860px;height:1150px;perspective:1600px">
    <div style="position:relative;width:100%;height:100%;background:#f4f1ea;box-shadow:18px 26px 40px rgba(0,0,0,.55);transform:rotateX(${inclinacion}deg) rotateZ(${giro}deg)">
      ${hoja(n)}
      <div style="position:absolute;inset:0;background:linear-gradient(125deg,rgba(255,255,255,0) 35%,rgba(0,0,0,.16) 100%)"></div>
    </div>
  </div>
</div></body></html>`

const nav = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const p = await nav.newPage()
await p.setViewport({ width: 1200, height: 1600 })
for (const [n, giro, inc] of [[1, -6, 9], [2, 4, 7]]) {
  await p.setContent(escena(n, giro, inc))
  await p.screenshot({ path: path.join(carpeta, `hoja${n}.jpg`), type: 'jpeg', quality: 88 })
  console.log(`fotos/hoja${n}.jpg`)
}
await nav.close()
