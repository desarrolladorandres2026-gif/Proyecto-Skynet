import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { procesarPruebasPendientes } = vi.hoisted(() => ({
  procesarPruebasPendientes: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../src/modules/copiloto/copiloto.despliegue.js', () => ({ procesarPruebasPendientes }))

import { motivoParaNoCorrerWorkers } from '../src/config/workers.js'
import {
  despertarWorkerDespliegue,
  iniciarWorkerDespliegue,
  detenerWorkerDespliegue,
} from '../src/modules/copiloto/copiloto.despliegue.worker.js'

const siguienteVuelta = () => new Promise((resolve) => setImmediate(resolve))

describe('config/workers — backend de desarrollo contra la base de producción', () => {
  const desarrolloContraProduccion = { nodeEnv: 'development', nombreBd: 'Skynet', frontendUrl: 'http://localhost:5173' }

  it('un backend local conectado a la base de producción no corre los workers', () => {
    expect(motivoParaNoCorrerWorkers(desarrolloContraProduccion)).toMatch(/DESACTIVADOS/)
  })

  it('el servidor de producción los corre', () => {
    expect(
      motivoParaNoCorrerWorkers({ nodeEnv: 'production', nombreBd: 'Skynet', frontendUrl: 'https://skynetttn.online' })
    ).toBeNull()
  })

  // El error caro es apagar los workers del VPS: basta una señal de "servidor
  // real" para que corran, aunque NODE_ENV esté mal puesto.
  it('con FRONTEND_URL pública los corre aunque falte NODE_ENV=production', () => {
    expect(motivoParaNoCorrerWorkers({ ...desarrolloContraProduccion, frontendUrl: 'https://skynetttn.online' })).toBeNull()
  })

  it('en desarrollo contra la base de desarrollo los corre', () => {
    expect(motivoParaNoCorrerWorkers({ ...desarrolloContraProduccion, nombreBd: 'Skynet_dev' })).toBeNull()
  })
})

describe('despertarWorkerDespliegue', () => {
  beforeEach(() => procesarPruebasPendientes.mockClear())
  afterEach(() => detenerWorkerDespliegue())

  it('no procesa nada si este proceso no arrancó el worker (el trabajo queda para el servidor)', async () => {
    despertarWorkerDespliegue()
    await siguienteVuelta()
    expect(procesarPruebasPendientes).not.toHaveBeenCalled()
  })

  it('con el worker arrancado, procesa en el acto', async () => {
    iniciarWorkerDespliegue()
    despertarWorkerDespliegue()
    await siguienteVuelta()
    expect(procesarPruebasPendientes).toHaveBeenCalledTimes(1)
  })
})
