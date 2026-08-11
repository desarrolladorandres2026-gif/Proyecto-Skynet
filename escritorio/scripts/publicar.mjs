// Sube al VPS la versión recién empaquetada para que los Skynet instalados la
// vean.  Uso:
//
//   npm run empaquetar
//   npm run publicar
//
// El destino se puede cambiar con SKYNET_SSH (por defecto prueba@skynetttn.online).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const carpetaEscritorio = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const carpetaInstalable = path.join(carpetaEscritorio, '..', 'instalable')
const { version } = JSON.parse(readFileSync(path.join(carpetaEscritorio, 'package.json'), 'utf8'))

const DESTINO_SSH = process.env.SKYNET_SSH || 'prueba@skynetttn.online'
const CARPETA_REMOTA = process.env.SKYNET_DESCARGAS || '/home/prueba/skynet-descargas'

const instalador = `Skynet-Instalador-${version}.exe`

// El orden NO es cosmético. latest.yml es lo que la app consulta para decidir
// si hay versión nueva; si se subiera primero, cualquier equipo que preguntase
// en esos segundos leería "existe la 1.1.0", pediría el .exe que todavía no
// está arriba y fallaría con un 404. Instalador primero, catálogo al final: la
// versión nueva no "existe" hasta que se puede descargar entera.
const archivos = [instalador, `${instalador}.blockmap`, 'latest.yml']

const faltan = archivos.filter((a) => !existsSync(path.join(carpetaInstalable, a)))
if (faltan.length) {
  console.error(`[publicar] Faltan archivos de la versión ${version}: ${faltan.join(', ')}`)
  console.error('[publicar] Ejecuta primero:  npm run empaquetar')
  process.exit(1)
}

console.log(`[publicar] Versión ${version} → ${DESTINO_SSH}:${CARPETA_REMOTA}`)

try {
  execFileSync('ssh', [DESTINO_SSH, `mkdir -p ${CARPETA_REMOTA}`], { stdio: 'inherit' })
  for (const archivo of archivos) {
    console.log(`[publicar] Subiendo ${archivo}...`)
    execFileSync('scp', [path.join(carpetaInstalable, archivo), `${DESTINO_SSH}:${CARPETA_REMOTA}/`], {
      stdio: 'inherit',
    })
  }
} catch (error) {
  console.error(`[publicar] Falló la subida: ${error.message}`)
  console.error(`[publicar] Comprueba que puedes entrar con:  ssh ${DESTINO_SSH}`)
  process.exit(1)
}

console.log(`
[publicar] Listo. Comprueba que el catálogo se sirve:
    curl -s https://skynetttn.online/descargas/latest.yml

Los equipos con Skynet abierto lo verán en su próxima revisión (máximo 6 horas),
o al instante desde el menú de la bandeja → "buscar actualizaciones".
`)
