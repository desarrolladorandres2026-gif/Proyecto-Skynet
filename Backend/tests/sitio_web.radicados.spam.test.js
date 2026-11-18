import { describe, it, expect } from 'vitest'
import { esSpamProbable, motivosDeSpam } from '../src/modules/sitio_web/radicados.spam.js'

describe('spam de radicados', () => {
  it('marca los patrones vistos en el formulario de contacto', () => {
    expect(esSpamProbable({ solicitante: '8054002077', correo: 'david.turner@jmailservice.com', asunto: 'traffic' })).toBe(true)
    expect(motivosDeSpam({ solicitante: 'Maya B', correo: 'mb@mail.com', asunto: 'Hello to whoever runs %domain% :)' })).toEqual(['plantilla_sin_reemplazar'])
  })
  it('no marca solicitudes legítimas', () => {
    expect(esSpamProbable({ solicitante: 'Víctor Palomar', correo: 'victorpalomar@gmail.com', asunto: 'Pregunta' })).toBe(false)
    expect(esSpamProbable({ solicitante: 'Alcaldia de Neiva', correo: 'x@alcaldianeiva.gov.co', asunto: 'Oficio 100% urgente' })).toBe(false)
    expect(esSpamProbable({})).toBe(false)
  })
})
