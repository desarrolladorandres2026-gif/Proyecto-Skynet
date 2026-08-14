/**
 * Corre las pruebas de fechas bajo varias zonas horarias del servidor.
 *
 * ── Por qué hace falta un script aparte ─────────────────────────────────────
 * Node lee la variable TZ una sola vez, al arrancar el proceso: no se puede
 * cambiar desde dentro de un test. Y justamente la TZ del servidor era la
 * causa de BUG-003 y BUG-005 — `setHours` opera en la zona del proceso, así
 * que el mismo código daba resultados distintos en el VPS (UTC) y en el
 * portátil de quien desarrolla, o si alguien ponía TZ=America/Bogota en el
 * servidor para "arreglar las fechas".
 *
 * Correr la suite bajo las dos zonas es lo que convierte "funciona en mi
 * máquina" en una garantía: si alguien vuelve a introducir un cálculo
 * dependiente de la zona del proceso, aquí se cae.
 *
 * Uso:
 *   npm run test:fechas
 */

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

// Se invoca el entry de vitest con el propio Node en vez de `npx vitest`:
// desde Node 20, spawnSync sobre un .cmd en Windows falla con EINVAL salvo
// que se use shell:true, y meter un shell por medio solo para esto agrega
// una capa de citado innecesaria.
const VITEST = createRequire(import.meta.url).resolve('vitest/vitest.mjs')

// UTC es la del VPS de producción; America/Bogota es la que alguien pondría
// intentando arreglar las fechas; Asia/Tokyo (UTC+9, al otro lado de la línea
// de fecha respecto a Colombia) atrapa errores de signo que las dos anteriores
// podrían dejar pasar.
const ZONAS = ['UTC', 'America/Bogota', 'Asia/Tokyo']
const ARCHIVOS = [
  'tests/fechas.test.js',
  'tests/ausencias.flujo.test.js',
  'tests/migracion.fechas.test.js',
  'tests/auditoria.rango.test.js',
  'tests/mantenimiento.fechas.test.js',
  'tests/backup.test.js',
  'tests/purga.retencion.test.js',
]

let fallos = 0

for (const TZ of ZONAS) {
  console.log(`\n${'─'.repeat(60)}\n  TZ=${TZ}\n${'─'.repeat(60)}`)
  const resultado = spawnSync(
    process.execPath,
    [VITEST, 'run', ...ARCHIVOS, '--reporter=basic'],
    { stdio: 'inherit', env: { ...process.env, TZ } }
  )
  if (resultado.status !== 0) {
    fallos += 1
    console.error(`\n❌  Fallaron pruebas con TZ=${TZ}`)
  }
}

console.log(`\n${'═'.repeat(60)}`)
if (fallos === 0) {
  console.log(`✅  Los cálculos de fecha dan igual en las ${ZONAS.length} zonas horarias probadas.`)
} else {
  console.error(`❌  ${fallos} de ${ZONAS.length} zonas fallaron: hay lógica que depende de la TZ del servidor.`)
  process.exitCode = 1
}
