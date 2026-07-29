// Libera el puerto del backend antes de arrancar, matando cualquier proceso
// que haya quedado escuchando ahí. Necesario en Windows porque node --watch
// a veces deja procesos huérfanos que no liberan el socket al reiniciar.
import { execFileSync } from 'node:child_process'

const PORT = String(process.env.PORT || 3001)

function pidsEnPuertoWindows(port) {
  const salida = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf-8' })
  const pids = new Set()
  for (const linea of salida.split('\n')) {
    const partes = linea.trim().split(/\s+/)
    if (partes.length < 5) continue
    const [, direccionLocal, , estado, pid] = partes
    if (estado === 'LISTENING' && direccionLocal.endsWith(`:${port}`)) {
      pids.add(pid)
    }
  }
  return [...pids]
}

function pidsEnPuertoUnix(port) {
  try {
    const salida = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf-8' })
    return salida.split('\n').map((l) => l.trim()).filter(Boolean)
  } catch {
    return []
  }
}

const pids = process.platform === 'win32' ? pidsEnPuertoWindows(PORT) : pidsEnPuertoUnix(PORT)

for (const pid of pids) {
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', pid, '/F'])
    } else {
      execFileSync('kill', ['-9', pid])
    }
    console.log(`🧹  Puerto ${PORT}: proceso ${pid} liberado`)
  } catch {
    // Ya pudo haber terminado entre la detección y el kill; no es un error real.
  }
}
