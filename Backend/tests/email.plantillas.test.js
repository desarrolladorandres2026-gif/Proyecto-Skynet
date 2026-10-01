import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { env } from '../src/config/env.js'
import { plantillaNotificacion, plantillaNotificacionTexto } from '../src/modules/notificaciones/notificaciones.plantillas.js'
import { correoRestablecerPassword } from '../src/utils/emailPlantillasTransaccionales.js'
import { CID_LOGO, rangoFechas, sinEmoji } from '../src/utils/emailDiseno.js'

const base = {
  titulo: 'Nuevo requerimiento pendiente',
  cuerpo: 'andres solicitó un requerimiento de compra',
  url: '/requerimientos/abc',
  usuarioId: '507f1f77bcf86cd799439011',
  categoria: 'requerimientos',
  fecha: new Date('2026-09-30T21:12:00Z'),
}

describe('plantilla de notificación por correo', () => {
  const original = { FRONTEND_URL: env.FRONTEND_URL, API_PUBLIC_URL: env.API_PUBLIC_URL }
  beforeEach(() => {
    env.FRONTEND_URL = 'https://skynetttn.online'
    env.API_PUBLIC_URL = 'https://skynetttn.online/api'
  })
  afterEach(() => Object.assign(env, original))

  it('lleva el logo, el módulo, la hora del Terminal y los detalles del asunto', () => {
    const html = plantillaNotificacion({ ...base, detalles: [{ etiqueta: 'Tipo', valor: 'Compra' }] })
    expect(html).toContain(`cid:${CID_LOGO}`)
    expect(html).toContain('Requerimientos')
    expect(html).toContain('30 de septiembre de 2026')
    expect(html).toContain('4:12')
    expect(html).toContain('>Tipo</td>')
    expect(html).toContain('>Compra</td>')
  })

  it('el botón nombra la pantalla solo cuando lleva a una concreta', () => {
    expect(plantillaNotificacion(base)).toContain('Ver el requerimiento')
    expect(plantillaNotificacion({ ...base, url: undefined })).toContain('Abrir la plataforma')
  })

  it('escapa lo que llega en los detalles', () => {
    const html = plantillaNotificacion({ ...base, detalles: [{ etiqueta: 'Nota', valor: '<script>x</script>' }] })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('un aviso normal explica por qué llega y permite darse de baja', () => {
    const html = plantillaNotificacion(base)
    expect(html).toContain('tienes activos los avisos de Requerimientos')
    expect(html).toContain('/notificaciones/baja?token=')
  })

  it('un aviso transaccional no ofrece darse de baja', () => {
    const html = plantillaNotificacion({ ...base, transaccional: true })
    expect(html).toContain('te llega aunque hayas desactivado los correos')
    expect(html).not.toContain('/notificaciones/baja')
  })

  it('sin URL pública no enlaza a localhost', () => {
    env.FRONTEND_URL = 'http://localhost:5173'
    const html = plantillaNotificacion(base)
    expect(html).not.toContain('localhost')
    expect(html).toContain('Ingresa a la plataforma para ver el detalle')
  })

  it('la versión en texto lleva los mismos datos y el enlace', () => {
    const texto = plantillaNotificacionTexto({ ...base, detalles: [{ etiqueta: 'Tipo', valor: 'Compra' }] })
    expect(texto).toContain('Tipo: Compra')
    expect(texto).toContain('Ver el requerimiento: https://skynetttn.online/requerimientos/abc')
  })

  it('el titular del correo no lleva emojis', () => {
    const html = plantillaNotificacion({ ...base, titulo: '🧠 Nuevo Cuestionario Programado' })
    expect(html).toContain('>Nuevo Cuestionario Programado</h1>')
  })
})

describe('correo de restablecer contraseña', () => {
  it('escapa el nombre y ofrece el enlace también como texto', () => {
    const enlace = 'https://skynetttn.online/reset-password?token=abc'
    const html = correoRestablecerPassword({ nombreUsuario: '<b>Ana</b>', enlace })
    expect(html).not.toContain('<b>Ana</b>')
    expect(html).toContain('Crear contraseña nueva')
    expect(html).toContain(`>${enlace}</a>`)
  })
})

describe('formato de fechas y títulos', () => {
  it('rangoFechas no repite mes ni año cuando coinciden', () => {
    expect(rangoFechas('2026-10-03T05:00:00Z', '2026-10-07T05:00:00Z')).toBe('Del 3 al 7 de octubre de 2026')
    expect(rangoFechas('2026-10-30T05:00:00Z', '2026-11-02T05:00:00Z')).toBe('Del 30 de octubre al 2 de noviembre de 2026')
    expect(rangoFechas('2026-12-30T05:00:00Z', '2027-01-02T05:00:00Z')).toBe('Del 30 de diciembre de 2026 al 2 de enero de 2027')
    expect(rangoFechas('2026-10-03T05:00:00Z', '2026-10-03T05:00:00Z')).toBe('3 de octubre de 2026')
  })

  it('sinEmoji quita pictogramas sin tocar tildes', () => {
    expect(sinEmoji('🚀 Acción lista ✅')).toBe('Acción lista')
  })
})
