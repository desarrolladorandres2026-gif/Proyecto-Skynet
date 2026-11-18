/**
 * Verifica que un despliegue NO cambie el estado de mantenimiento de la plataforma.
 *
 * Solo lee GET /api/plataforma/estado (público, sin sesión). No escribe nada.
 *
 * Uso en el VPS:
 *   node scripts/verificar-mantenimiento-deploy.js antes     # ANTES de git pull / pm2 restart
 *   git pull && pm2 restart skynet-backend
 *   node scripts/verificar-mantenimiento-deploy.js despues   # DESPUÉS del reinicio
 *
 * URL base: variable VERIFICAR_URL (por defecto http://127.0.0.1:3001, el
 * backend directo — evita depender de nginx/DNS). El snapshot se guarda en
 * el directorio temporal del sistema.
 *
 * Código de salida: 0 = estado intacto, 1 = el estado cambió de forma
 * inesperada (o no se pudo consultar).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const BASE = (process.env.VERIFICAR_URL || 'http://127.0.0.1:3001').replace(/\/$/, '')
const SNAPSHOT = path.join(os.tmpdir(), 'skynet-mantenimiento-snapshot.json')
const modo = process.argv[2]

async function consultar() {
  const res = await fetch(`${BASE}/api/plataforma/estado`)
  if (!res.ok) throw new Error(`GET /api/plataforma/estado respondió ${res.status}`)
  const { estado } = await res.json()
  return estado
}

function resumen(e) {
  return {
    status: e.status,
    enabled: e.enabled,
    scheduledStart: e.scheduledStart,
    scheduledEnd: e.scheduledEnd,
    reason: e.reason,
    ahora: e.ahora,
  }
}

function imprimir(titulo, r) {
  console.log(`\n${titulo}`)
  console.log(`  status        : ${r.status}  (enabled=${r.enabled})`)
  console.log(`  scheduledEnd  : ${r.scheduledEnd || '— (sin hora de fin: hasta nuevo aviso)'}`)
  console.log(`  motivo        : ${r.reason || '—'}`)
}

async function main() {
  if (modo !== 'antes' && modo !== 'despues') {
    console.error('Uso: node scripts/verificar-mantenimiento-deploy.js <antes|despues>')
    process.exit(1)
  }

  const actual = resumen(await consultar())

  if (modo === 'antes') {
    fs.writeFileSync(SNAPSHOT, JSON.stringify(actual, null, 2))
    imprimir('Estado ANTES del deploy (snapshot guardado)', actual)

    if (actual.status === 'en_mantenimiento' && actual.scheduledEnd) {
      const minutos = Math.round((new Date(actual.scheduledEnd) - new Date(actual.ahora)) / 60000)
      console.log(`\n⚠️  El mantenimiento termina solo en ~${minutos} min. Si el deploy tarda más, se cerrará automáticamente.`)
      if (minutos < 15) {
        console.log('   Margen corto: extiende la hora de fin o reactívalo sin hora de fin antes de desplegar.')
      }
    } else if (actual.status === 'operativa') {
      console.log('\nℹ️  La plataforma está operativa: no hay mantenimiento que proteger ahora mismo.')
    }
    console.log(`\nSiguiente paso: despliega y corre «verificar-mantenimiento-deploy.js despues».`)
    return
  }

  if (!fs.existsSync(SNAPSHOT)) {
    console.error(`No hay snapshot previo (${SNAPSHOT}). Corre primero el modo «antes».`)
    process.exit(1)
  }
  const previo = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'))
  imprimir('Estado ANTES', previo)
  imprimir('Estado AHORA', actual)

  // Una transición legítima: el mantenimiento llegó a su hora de fin durante el deploy.
  const vencio =
    previo.status === 'en_mantenimiento' &&
    previo.scheduledEnd &&
    new Date(previo.scheduledEnd) <= new Date(actual.ahora)

  const cambio = previo.status !== actual.status || previo.enabled !== actual.enabled
  if (!cambio) {
    console.log('\n✅ El estado de mantenimiento se mantuvo igual tras el deploy.')
    return
  }
  if (vencio) {
    console.log(`\n⚠️  El estado cambió porque la hora de fin (${previo.scheduledEnd}) venció durante el deploy.`)
    console.log('   Es el comportamiento diseñado, no un fallo del deploy. Reactívalo si hace falta.')
    process.exit(1)
  }
  console.log('\n❌ El estado CAMBIÓ sin que venciera la ventana. Revisa:')
  console.log('   - MONGO_URI del .env del VPS (¿apunta a la misma base que antes?)')
  console.log('   - pm2 logs skynet-backend (errores al arrancar / lectura del estado)')
  process.exit(1)
}

main().catch((err) => {
  console.error(`\n❌ No se pudo consultar el estado (${BASE}): ${err.message}`)
  console.error('   ¿El backend está arriba? Define VERIFICAR_URL si no escucha en 127.0.0.1:3001.')
  process.exit(1)
})
