import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import { reservarTurno, registrarRechazoExterno, estadoCuota, reiniciarCuota } from '../src/modules/copiloto/copiloto.cuota.js'

// La capa gratuita de Gemini permite 15 peticiones por minuto POR PROYECTO
// (verificado contra la API real: quotaId
// GenerateRequestsPerMinutePerProjectPerModel-FreeTier, con RetryInfo pidiendo
// 19 s de espera), y cada mensaje del copiloto que usa una herramienta gasta
// dos. Medido bajo carga: dentro de cuota el modelo responde en 400-1200 ms,
// pero al rozarla algunas peticiones se sirven muy despacio y devuelven 200
// tras 8, 29 o 31 segundos — el patrón exacto de los "Request lento: POST
// /chat" que motivaron esta auditoría.
//
// El marcapasos evita empujar por encima de ese ritmo. Lo que fija esta suite
// es la propiedad que lo hace útil para el usuario: cuando no hay presupuesto,
// la respuesta llega en MILISEGUNDOS y con un mensaje comprensible — nunca
// dejando a alguien esperando decenas de segundos.

describe('marcapasos de cuota de Gemini', () => {
  beforeEach(() => reiniciarCuota())
  afterEach(() => vi.useRealTimers())

  it('deja pasar sin costo mientras haya presupuesto', async () => {
    const { presupuesto } = estadoCuota()

    for (let i = 0; i < presupuesto; i++) {
      const { espera } = await reservarTurno()
      expect(espera).toBe(0)
    }

    expect(estadoCuota().usadas).toBe(presupuesto)
  })

  it('reserva un margen por debajo del límite real de Google', () => {
    const { presupuesto, limitePorMinuto } = estadoCuota()
    // Apuntar al límite exacto garantiza rozarlo: las ventanas de Google y la
    // nuestra no arrancan en el mismo instante.
    expect(presupuesto).toBeLessThan(limitePorMinuto)
  })

  it('sin presupuesto falla RÁPIDO y con mensaje presentable, no durmiendo', async () => {
    const { presupuesto } = estadoCuota()
    for (let i = 0; i < presupuesto; i++) await reservarTurno()

    const inicio = Date.now()
    await expect(reservarTurno()).rejects.toMatchObject({ status: 429 })
    const transcurrido = Date.now() - inicio

    // El punto entero del cambio: la ventana llena se detecta al instante, en
    // vez de descubrirse saliendo a la red y esperando lo que el servicio
    // saturado tarde en contestar.
    expect(transcurrido).toBeLessThan(200)
  })

  it('el mensaje de saturación dice cuánto esperar y no habla de errores internos', async () => {
    const { presupuesto } = estadoCuota()
    for (let i = 0; i < presupuesto; i++) await reservarTurno()

    await expect(reservarTurno()).rejects.toThrow(/vuelve a preguntarme en \d+ segundos/i)
    await expect(reservarTurno()).rejects.not.toThrow(/error interno|no respondió correctamente/i)
  })

  it('libera turnos cuando la ventana de un minuto pasa', async () => {
    const { presupuesto } = estadoCuota()
    for (let i = 0; i < presupuesto; i++) await reservarTurno()
    await expect(reservarTurno()).rejects.toMatchObject({ status: 429 })

    // Se adelanta el reloj un minuto y un segundo: la ventana entera caduca.
    const real = Date.now
    Date.now = () => real() + 61_000
    try {
      expect(estadoCuota().usadas).toBe(0)
      const { espera } = await reservarTurno()
      expect(espera).toBe(0)
    } finally {
      Date.now = real
    }
  })

  it('un 429 venido de Google satura la ventana local', async () => {
    // Pasa cuando otro proceso consume del mismo proyecto: nuestra cuenta es
    // local y la de Google es global. Sin esto, seguiríamos mandando peticiones
    // condenadas a chocar contra la misma pared.
    expect(estadoCuota().usadas).toBe(0)

    registrarRechazoExterno()

    expect(estadoCuota().usadas).toBe(estadoCuota().presupuesto)
    await expect(reservarTurno()).rejects.toMatchObject({ status: 429 })
  })

  it('no se queda esperando si el usuario cierra el chat', async () => {
    const { presupuesto } = estadoCuota()
    for (let i = 0; i < presupuesto; i++) await reservarTurno()

    // Una espera corta (dentro del tope) que se cancela a mitad: el turno no
    // debe consumirse ni la promesa quedarse colgada.
    const real = Date.now
    // Coloca el reloj de forma que la espera necesaria caiga bajo el tope.
    Date.now = () => real() + 59_500
    try {
      const controlador = new AbortController()
      const promesa = reservarTurno(controlador.signal)
      controlador.abort()
      await expect(promesa).rejects.toMatchObject({ name: 'AbortError' })
    } finally {
      Date.now = real
    }
  })
})
