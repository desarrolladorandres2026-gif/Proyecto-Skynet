import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/modules/notificaciones/notificaciones.service.js', () => ({
  notificar: vi.fn(),
}))
vi.mock('../src/modules/ia/ia.service.js', () => ({
  avisarIA: vi.fn(),
}))

import { notificar } from '../src/modules/notificaciones/notificaciones.service.js'
import { avisarIA } from '../src/modules/ia/ia.service.js'
import { notificarUsuarios } from '../src/utils/sendPush.js'

// Regresión de BUG-011 (auditoría 2026-08-13). Cada llamador de
// notificarUsuarios() ya completó la operación de negocio real (p. ej.
// `await reporte.save()` en danos.service.js) ANTES de notificar. Si
// notificar() lanzaba —un blip de Mongo al escribir EnvioNotificacion, una
// categoría mal formada— la excepción subía sin capturar y el controller
// respondía 500 sobre una operación que EN REALIDAD SÍ se había guardado: la
// persona veía "error" y podía reintentar, duplicando el reporte real.

describe('notificarUsuarios() — la notificación nunca puede tumbar al llamador', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('no propaga el error si notificar() lanza', async () => {
    notificar.mockRejectedValue(new Error('Mongo no disponible'))

    await expect(
      notificarUsuarios(['507f1f77bcf86cd799439011'], { titulo: 'x', cuerpo: 'y' })
    ).resolves.toBeUndefined()
  })

  it('sigue intentando el aviso de IA aunque la notificación push/email haya fallado', async () => {
    notificar.mockRejectedValue(new Error('Mongo no disponible'))
    avisarIA.mockResolvedValue(undefined)

    await notificarUsuarios(['507f1f77bcf86cd799439011'], { titulo: 'x', cuerpo: 'y' }, 'danos')

    expect(avisarIA).toHaveBeenCalledTimes(1)
  })

  it('cuando todo va bien, sigue llamando a notificar() con los datos correctos', async () => {
    notificar.mockResolvedValue([])

    await notificarUsuarios(['507f1f77bcf86cd799439011'], { titulo: 'Título', cuerpo: 'Cuerpo' }, 'mantenimiento')

    expect(notificar).toHaveBeenCalledWith(
      expect.objectContaining({
        usuarios: ['507f1f77bcf86cd799439011'],
        categoria: 'mantenimiento',
        titulo: 'Título',
        cuerpo: 'Cuerpo',
      })
    )
  })
})
