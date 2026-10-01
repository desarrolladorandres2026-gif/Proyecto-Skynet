import { describe, it, expect, vi, beforeEach } from 'vitest'

// Se sustituye el SMTP real: lo que se prueba es que una dirección reservada ni
// siquiera llega a abrir conexión (sendMail no se llama), no el envío en sí.
const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail, verify: vi.fn() }) } }))

import fs from 'node:fs'
import { esDestinoNoEntregable, enviarEmailGenerico, enviarEmailReset } from '../src/utils/email.js'
import { CID_LOGO } from '../src/utils/emailDiseno.js'

describe('utils/email — destinos no entregables', () => {
  beforeEach(() => {
    sendMail.mockReset()
  })

  it.each([
    'admin@skynet.local',
    'ADMIN@Skynet.Local',
    'admin@skynet.local.',
    'x9k2@example.com',
    'alguien@correo.example.org',
    'a@servidor.test',
    'a@algo.invalid',
    'a@maquina.localhost',
  ])('%s no es entregable', (direccion) => {
    expect(esDestinoNoEntregable(direccion)).toBe(true)
  })

  it.each([
    'persona@gmail.com',
    'persona@hotmail.com',
    'notificaciones@skynetttn.online',
    'x@examples.com',
    'x@myexample.com',
    'x@local.com.co',
  ])('%s sí es entregable', (direccion) => {
    expect(esDestinoNoEntregable(direccion)).toBe(false)
  })

  it('enviarEmailGenerico rechaza un dominio reservado sin tocar el SMTP, marcado para no reintentar', async () => {
    await expect(
      enviarEmailGenerico({ to: 'admin@skynet.local', subject: 'S', html: '<p>h</p>', text: 't' })
    ).rejects.toMatchObject({ descartar: true })
    expect(sendMail).not.toHaveBeenCalled()
  })

  it('enviarEmailGenerico envía normalmente a una dirección real', async () => {
    sendMail.mockResolvedValueOnce({})
    await enviarEmailGenerico({ to: 'persona@gmail.com', subject: 'S', html: '<p>h</p>', text: 't' })
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail.mock.calls[0][0].to).toBe('persona@gmail.com')
  })

  it('adjunta el logo incrustado solo cuando el HTML lo usa', async () => {
    sendMail.mockResolvedValue({})
    await enviarEmailGenerico({ to: 'persona@gmail.com', subject: 'S', html: `<img src="cid:${CID_LOGO}">`, text: 't' })
    await enviarEmailGenerico({ to: 'persona@gmail.com', subject: 'S', html: '<p>sin logo</p>', text: 't' })

    const [conLogo, sinLogo] = sendMail.mock.calls.map(([datos]) => datos)
    expect(conLogo.attachments).toEqual([expect.objectContaining({ cid: CID_LOGO })])
    expect(fs.existsSync(conLogo.attachments[0].path)).toBe(true)
    expect(sinLogo.attachments).toBeUndefined()
  })

  it('el correo de restablecer contraseña sale con diseño, texto plano y logo', async () => {
    sendMail.mockResolvedValueOnce({})
    await enviarEmailReset('persona@gmail.com', 'Ana', 'token123')
    const datos = sendMail.mock.calls[0][0]
    expect(datos.html).toContain('reset-password?token=token123')
    expect(datos.text).toContain('reset-password?token=token123')
    expect(datos.attachments).toEqual([expect.objectContaining({ cid: CID_LOGO })])
  })

  // Sin la comprobación previa, enviarConReintentos esperaría 1 s + 2 s de
  // backoff antes de rendirse con una dirección que nunca va a existir.
  it('enviarEmailReset no reintenta contra un dominio reservado', async () => {
    const inicio = Date.now()
    await expect(enviarEmailReset('x@example.com', 'X', 'token')).rejects.toMatchObject({ descartar: true })
    expect(sendMail).not.toHaveBeenCalled()
    expect(Date.now() - inicio).toBeLessThan(500)
  })
})
