import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  debeMostrarBanner,
  esDescartable,
  MIN_AVISO_PREVIO_POR_DEFECTO,
} from './BannerMantenimiento.jsx'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Se leen como TEXTO, no se importan. Importar Backend/src/config/env.js
// ejecutaría dotenv y lanzaría por MONGO_URI/JWT_SECRET ausentes; y este
// paquete no tiene por qué poder arrancar el backend para verificar una
// constante. Mismo enfoque cruzado que ya usa src/pdf/requerimientoPdf.test.js,
// que lee un asset real de Backend/storage.
function leerDelBackend(rutaRelativa) {
  return readFileSync(resolve(__dirname, '../../../Backend/src', rutaRelativa), 'utf8')
}

describe('Política de reaparición del banner', () => {
  it('se muestra mientras nadie lo haya descartado', () => {
    expect(debeMostrarBanner(null, 300)).toBe(true)
  })

  it('se oculta tras descartarlo, mientras falte tiempo', () => {
    expect(debeMostrarBanner(Date.now(), 300)).toBe(false)
  })

  it('reaparece al entrar en el umbral, aunque estuviera descartado', () => {
    expect(debeMostrarBanner(Date.now(), 15)).toBe(true)
    expect(debeMostrarBanner(Date.now(), 3)).toBe(true)
    expect(debeMostrarBanner(Date.now(), 0)).toBe(true)
  })

  it('deja de poder cerrarse dentro del umbral', () => {
    expect(esDescartable(300)).toBe(true)
    expect(esDescartable(16)).toBe(true)
    expect(esDescartable(15)).toBe(false)
    expect(esDescartable(0)).toBe(false)
  })

  it('respeta el umbral que le indique el backend, no uno fijo', () => {
    // Con antelación de 30 min, a los 20 minutos ya debe ser obligatorio...
    expect(debeMostrarBanner(Date.now(), 20, 30)).toBe(true)
    expect(esDescartable(20, 30)).toBe(false)
    // ...y con antelación de 5, a los 20 minutos todavía no.
    expect(debeMostrarBanner(Date.now(), 20, 5)).toBe(false)
    expect(esDescartable(20, 5)).toBe(true)
  })

  it('sin hora de inicio conocida no fuerza nada', () => {
    expect(debeMostrarBanner(Date.now(), null)).toBe(false)
    expect(esDescartable(null)).toBe(true)
  })
})

// ── Protección contra divergencia backend/frontend ──────────────────────────
// El umbral REAL viaja en cada respuesta de /api/plataforma/estado
// (`avisoPrevioMin`), así que cambiar PLATAFORMA_AVISO_PREVIO_MIN en el VPS se
// propaga solo y ninguna de estas pruebas hace falta para ese caso.
//
// Lo que sí protegen es el contrato que hace posible esa propagación: que el
// backend siga enviando el campo, y que la red de seguridad del frontend no se
// separe del valor por defecto del backend. Sin esto, quitar el campo del DTO
// dejaría al banner cayendo al literal en silencio — el fallo más difícil de
// notar, porque todo seguiría funcionando "casi bien".
describe('Sincronización del umbral con el backend', () => {
  it('el DTO público sigue exponiendo avisoPrevioMin', () => {
    const dto = leerDelBackend('modules/plataforma/plataforma.dto.js')
    const declaracion = dto.match(/avisoPrevioMin:\s*env\.PLATAFORMA_AVISO_PREVIO_MIN/)

    expect(
      declaracion,
      'plataforma.dto.js debe seguir enviando `avisoPrevioMin: env.PLATAFORMA_AVISO_PREVIO_MIN` ' +
        'en aEstadoPublico(). Sin ese campo, BannerMantenimiento cae al literal por defecto ' +
        'y deja de seguir al backend sin que nada falle a la vista.'
    ).not.toBeNull()
  })

  it('el aviso previo se dispara en el backend con el mismo umbral que fija el banner', () => {
    const service = leerDelBackend('modules/plataforma/plataforma.service.js')
    const comparacion = service.match(
      /scheduledStart\s*-\s*ahora\s*<=\s*env\.PLATAFORMA_AVISO_PREVIO_MIN\s*\*\s*60_?000/
    )

    expect(
      comparacion,
      'evaluarTransiciones() debe seguir disparando el aviso previo comparando contra ' +
        'PLATAFORMA_AVISO_PREVIO_MIN. Si esa condición cambia, el banner y la notificación ' +
        'dejan de referirse al mismo instante.'
    ).not.toBeNull()
  })

  it('la red de seguridad del frontend coincide con el valor por defecto del backend', () => {
    const envSrc = leerDelBackend('config/env.js')
    const coincidencia = envSrc.match(/PLATAFORMA_AVISO_PREVIO_MIN:[^\n]*\|\|\s*(\d+)/)

    // Se comprueba primero que la línea siga existiendo con esa forma: una
    // expresión regular que deja de coincidir en silencio convertiría esta
    // prueba en verde permanente, que es peor que no tenerla.
    expect(
      coincidencia,
      'No se encontró el valor por defecto de PLATAFORMA_AVISO_PREVIO_MIN en Backend/src/config/env.js. ' +
        'Si se reestructuró esa línea, actualiza también esta prueba.'
    ).not.toBeNull()

    expect(Number(coincidencia[1])).toBe(MIN_AVISO_PREVIO_POR_DEFECTO)
  })
})
