import { describe, it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'

const execFileAsync = promisify(execFile)
const RAIZ = path.resolve(import.meta.dirname, '..')

// Prueba de integración real (no mockea nada): corre el script tal cual se
// correría antes de un deploy y confirma que, en el estado actual del
// repositorio, no hay ningún check bloqueante fallido. Si alguien rompe una
// de las protecciones que verifica este script (agrega un router sin
// verificarToken, un script destructivo sin guardaProduccion, un secreto
// hardcodeado, etc.), este test debería fallar junto con el verify real.
describe('scripts/verificar-produccion.js', () => {
  it('corre sin errores inesperados y reporta el formato esperado', async () => {
    let resultado
    try {
      resultado = await execFileAsync('node', ['scripts/verificar-produccion.js'], { cwd: RAIZ, timeout: 60_000 })
    } catch (err) {
      // execFile lanza si el proceso sale con código != 0 — igual interesa
      // inspeccionar el stdout (el verify real reporta y sale 1 si algo es
      // bloqueante), no solo tratarlo como "el test falló".
      resultado = err
    }

    const salida = resultado.stdout
    expect(salida).toContain('Verify de producción — Skynet')
    expect(salida).toContain('[Entorno]')
    expect(salida).toContain('[Autenticación]')
    expect(salida).toContain('[Secretos]')
    expect(salida).toContain('[Scripts destructivos]')

    // En el estado actual del repo no debería haber ningún check bloqueante
    // fallido (🔴). Si lo hay, este test lo señala explícitamente en vez de
    // solo fallar por el exit code.
    expect(salida).not.toContain('🔴')
    expect(salida).not.toMatch(/check\(s?\) BLOQUEANTE/i)
    expect(resultado.code ?? 0).toBe(0)
  })

  // Confirma que el gate REALMENTE bloquea (exit != 0), no solo que reporte
  // texto — es justo lo que npm run predeploy necesita para cortar la
  // cadena `&&` antes de llegar a lint/build. Simula el estado real del
  // .env actual del repo (localhost en producción) sin tocar ningún archivo.
  it('bloquea (exit != 0) si NODE_ENV=production detecta URLs de localhost', async () => {
    let resultado
    try {
      resultado = await execFileAsync('node', ['scripts/verificar-produccion.js'], {
        cwd: RAIZ,
        timeout: 60_000,
        env: { ...process.env, NODE_ENV: 'production' },
      })
    } catch (err) {
      resultado = err
    }

    expect(resultado.code).not.toBe(0)
    expect(resultado.stdout).toContain('🔴')
    expect(resultado.stdout).toMatch(/BLOQUEANTE fallido/)
  })

  it('bloquea (exit != 0) si NODE_ENV=production y falta BACKUP_CIFRADO_CLAVE, incluso con URLs correctas', async () => {
    let resultado
    try {
      resultado = await execFileAsync('node', ['scripts/verificar-produccion.js'], {
        cwd: RAIZ,
        timeout: 60_000,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          CORS_ORIGIN: 'https://skynetttn.online',
          FRONTEND_URL: 'https://skynetttn.online',
          API_PUBLIC_URL: 'https://skynetttn.online/api',
          FILES_PUBLIC_URL: 'https://skynetttn.online/storage',
          BACKUP_CIFRADO_CLAVE: '',
        },
      })
    } catch (err) {
      resultado = err
    }

    expect(resultado.code).not.toBe(0)
    expect(resultado.stdout).toContain('[Backup]')
  })
})
