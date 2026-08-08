#!/usr/bin/env node
// Descarga el modelo de voz en español y lo deja en el formato que necesita
// `vosk-browser`.
//
// ── Por qué hace falta convertirlo ──────────────────────────────────────────
// Alphacephei (los autores de Vosk) publica los modelos en .zip, pero la build
// WebAssembly los carga como .tar.gz: descomprime el archivo dentro del
// sistema de ficheros virtual de Emscripten, y ahí solo entiende tar. Así que
// el paso es: bajar el zip → extraer → volver a empaquetar como tar.gz.
//
// ── Por qué no se versiona el modelo ────────────────────────────────────────
// Son 40 MB de binarios que no se leen en una revisión de código y que no
// cambian nunca entre commits. Meterlos en Git engorda el repositorio para
// siempre (Git guarda cada versión), así que se descarga bajo demanda y la
// carpeta recursos/ queda ignorada.
//
// Uso:  npm run modelo

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RECURSOS = path.join(AQUI, '..', 'recursos')
const DESTINO = path.join(RECURSOS, 'modelo-voz-es.tar.gz')

// Modelo "small": 40 MB y suficiente para lo que se le pide aquí (una frase de
// activación y comandos cortos). El grande son 1,4 GB y su ventaja está en
// dictado largo, que no es este caso — no compensa multiplicar por 35 el peso
// del instalador.
const URL_MODELO = 'https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip'

// El nombre de la carpeta DENTRO del tar importa: vosk-browser monta el
// archivo en su sistema de ficheros virtual y busca ahí la estructura estándar
// de Vosk (am/, conf/, graph/, ivector/). Se normaliza a "model" para no
// depender de cómo venga nombrada la carpeta del zip, que cambia con cada
// versión del modelo.
const CARPETA_EN_TAR = 'model'

function log(...args) {
  console.log('[modelo]', ...args)
}

async function descargar(url, destino) {
  log(`descargando ${url}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`El servidor respondió ${res.status} al pedir el modelo`)

  const total = Number(res.headers.get('content-length')) || 0
  const trozos = []
  let recibido = 0
  let ultimoAviso = 0

  for await (const trozo of res.body) {
    trozos.push(trozo)
    recibido += trozo.length
    // Un progreso cada 10%: son 40 MB y sin ninguna señal parece colgado, pero
    // imprimir por cada trozo llena la consola de ruido.
    const pct = total ? Math.floor((recibido / total) * 100) : 0
    if (total && pct >= ultimoAviso + 10) {
      ultimoAviso = pct - (pct % 10)
      log(`  ${ultimoAviso}%`)
    }
  }

  fs.writeFileSync(destino, Buffer.concat(trozos))
  log(`descargado (${(recibido / 1e6).toFixed(1)} MB)`)
}

// Se usa PowerShell y no una librería de npm porque Expand-Archive viene con
// Windows: una dependencia menos que instalar, auditar y mantener para un
// script que se ejecuta una sola vez.
function extraerZip(zip, destino) {
  log('extrayendo…')
  execFileSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${destino}' -Force`],
    { stdio: 'inherit' }
  )
}

// La carpeta que el zip trae dentro. Se busca en vez de asumir el nombre
// porque cambia con cada versión del modelo ("vosk-model-small-es-0.42").
function carpetaDelModelo(raiz) {
  const entradas = fs.readdirSync(raiz, { withFileTypes: true }).filter((e) => e.isDirectory())
  // Si el zip trae el contenido suelto (sin carpeta contenedora), la raíz ES
  // el modelo: se detecta por la presencia de las carpetas de Vosk.
  if (fs.existsSync(path.join(raiz, 'am')) || fs.existsSync(path.join(raiz, 'conf'))) return raiz
  if (entradas.length !== 1) {
    throw new Error(`Esperaba una sola carpeta dentro del zip y encontré ${entradas.length}`)
  }
  return path.join(raiz, entradas[0].name)
}

// ── Escritura de tar en Node puro ───────────────────────────────────────────
// El primer intento fue `execFileSync('tar', …)` y falló de una forma que vale
// la pena dejar escrita: GNU tar (el que trae Git para Windows) interpreta
// "C:\Users\…" como `host:ruta`, o sea intenta conectarse por red a un equipo
// llamado "C". Windows trae además bsdtar en System32, que sí lo entiende,
// así que el comportamiento dependía de cuál de los dos apareciera antes en el
// PATH de quien ejecutara el script.
//
// Un formato tan simple no justifica esa lotería ni una dependencia de npm:
// son cabeceras de 512 bytes con campos en octal. Escribirlo aquí hace el
// script determinista en cualquier equipo.

const BLOQUE = 512

function cabeceraTar(nombre, tamano, esDirectorio) {
  const b = Buffer.alloc(BLOQUE)
  // Dentro de un tar las rutas SIEMPRE van con barra normal, aunque se genere
  // en Windows: con barras invertidas, el nombre del fichero pasa a ser
  // "model\am\final.mdl" (un solo archivo con barras en el nombre) y el
  // modelo se descomprime plano e inservible.
  let ruta = nombre.split(path.sep).join('/')
  if (esDirectorio && !ruta.endsWith('/')) ruta += '/'

  // ustar parte los nombres largos entre `prefix` (155) y `name` (100). Las
  // rutas de un modelo de Vosk no llegan ni cerca, pero cortar en silencio un
  // nombre produciría un archivo corrupto que solo se detectaría al usarlo.
  let prefijo = ''
  if (ruta.length > 100) {
    const corte = ruta.lastIndexOf('/', ruta.length - 100)
    if (corte <= 0) throw new Error(`Ruta demasiado larga para el formato tar: ${ruta}`)
    prefijo = ruta.slice(0, corte)
    ruta = ruta.slice(corte + 1)
    if (ruta.length > 100 || prefijo.length > 155) {
      throw new Error(`Ruta demasiado larga para el formato tar: ${nombre}`)
    }
  }

  const octal = (valor, ancho) => valor.toString(8).padStart(ancho - 1, '0') + '\0'

  b.write(ruta, 0, 100, 'utf8')
  b.write(octal(esDirectorio ? 0o755 : 0o644, 8), 100, 8)
  b.write(octal(0, 8), 108, 8) // uid
  b.write(octal(0, 8), 116, 8) // gid
  b.write(octal(tamano, 12), 124, 12)
  b.write(octal(Math.floor(Date.now() / 1000), 12), 136, 12)
  b.write(esDirectorio ? '5' : '0', 156, 1)
  b.write('ustar\0', 257, 6)
  b.write('00', 263, 2)
  if (prefijo) b.write(prefijo, 345, 155, 'utf8')

  // La suma de control se calcula con su propio campo lleno de espacios; por
  // eso se escribe DESPUÉS de todo lo demás y con el campo inicializado así.
  b.fill(' ', 148, 156)
  let suma = 0
  for (const byte of b) suma += byte
  b.write(suma.toString(8).padStart(6, '0') + '\0 ', 148, 8)

  return b
}

function listarArchivos(raiz, base = '') {
  const salida = []
  for (const entrada of fs.readdirSync(raiz, { withFileTypes: true })) {
    const completo = path.join(raiz, entrada.name)
    const relativo = base ? path.join(base, entrada.name) : entrada.name
    if (entrada.isDirectory()) {
      salida.push({ ruta: relativo, directorio: true })
      salida.push(...listarArchivos(completo, relativo))
    } else if (entrada.isFile()) {
      salida.push({ ruta: relativo, directorio: false, absoluto: completo })
    }
  }
  return salida
}

function empaquetarTarGz(carpetaModelo, destino) {
  log('empaquetando como tar.gz…')

  const partes = [cabeceraTar(CARPETA_EN_TAR, 0, true)]
  for (const entrada of listarArchivos(carpetaModelo, CARPETA_EN_TAR)) {
    if (entrada.directorio) {
      partes.push(cabeceraTar(entrada.ruta, 0, true))
      continue
    }
    const datos = fs.readFileSync(entrada.absoluto)
    partes.push(cabeceraTar(entrada.ruta, datos.length, false), datos)
    // Cada archivo se rellena hasta el múltiplo de 512 siguiente.
    const sobra = datos.length % BLOQUE
    if (sobra) partes.push(Buffer.alloc(BLOQUE - sobra))
  }
  // Fin de archivo: dos bloques vacíos.
  partes.push(Buffer.alloc(BLOQUE * 2))

  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.writeFileSync(destino, zlib.gzipSync(Buffer.concat(partes), { level: 6 }))
}

async function main() {
  if (fs.existsSync(DESTINO)) {
    log(`ya existe: ${DESTINO}`)
    log('bórralo si quieres volver a descargarlo.')
    return
  }

  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'skynet-modelo-'))
  const zip = path.join(temporal, 'modelo.zip')

  try {
    await descargar(URL_MODELO, zip)
    const extraido = path.join(temporal, 'extraido')
    extraerZip(zip, extraido)
    empaquetarTarGz(carpetaDelModelo(extraido), DESTINO)

    const mb = (fs.statSync(DESTINO).size / 1e6).toFixed(1)
    log(`listo: ${DESTINO} (${mb} MB)`)
    log('ya puedes activar "Oye Skynet" desde el menú de la bandeja.')
  } finally {
    // El temporal son ~120 MB entre el zip y lo extraído: dejarlo tirado en
    // %TEMP% cada vez que alguien ejecuta esto no es aceptable.
    fs.rmSync(temporal, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error('[modelo] FALLÓ:', err.message)
  process.exit(1)
})
