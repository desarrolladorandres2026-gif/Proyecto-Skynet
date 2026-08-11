// Se ejecuta automáticamente antes de "npm run empaquetar" (hook "preempaquetar" de npm).
// Windows Defender bloquea momentáneamente los binarios recién escritos en instalable/win-unpacked
// al escanearlos, y un Skynet.exe abierto también los bloquea. Sin esto, cada empaquetado
// deja basura de intentos previos y electron-builder falla con ERR_ELECTRON_BUILDER_CANNOT_EXECUTE.
//
// Se borra SOLO win-unpacked, no la carpeta instalable/ entera: ahí quedan los
// instaladores de versiones anteriores y el latest.yml, que son justamente lo que
// se publica. Borrarlos obligaría a reconstruir versiones viejas para poder
// reproducir una publicación.
import { execFileSync } from 'node:child_process'
import { rmSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { setTimeout as esperar } from 'node:timers/promises'

const raizProyecto = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const carpetaBuild = path.join(raizProyecto, 'instalable', 'win-unpacked')

function matarProcesos() {
  const script =
    "Get-Process | Where-Object { $_.ProcessName -eq 'Skynet' -or $_.ProcessName -eq 'electron' } " +
    '| Stop-Process -Force -ErrorAction SilentlyContinue'
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' })
  } catch {
    // no había procesos que matar
  }
}

async function limpiar() {
  if (!existsSync(carpetaBuild)) return

  console.log('[limpiar-build] Cerrando procesos que puedan tener el build anterior abierto...')
  matarProcesos()
  await esperar(1000)

  const intentos = 6
  for (let i = 1; i <= intentos; i++) {
    try {
      rmSync(carpetaBuild, { recursive: true, force: true })
      console.log('[limpiar-build] win-unpacked anterior eliminado, listo para reescribir.')
      return
    } catch (error) {
      if (i === intentos) {
        console.error(`[limpiar-build] No se pudo limpiar ${carpetaBuild} tras ${intentos} intentos: ${error.message}`)
        console.error('[limpiar-build] Cierra Skynet.exe o el explorador de Windows en esa carpeta e inténtalo de nuevo.')
        process.exit(1)
      }
      await esperar(3000)
    }
  }
}

await limpiar()
