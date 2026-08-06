import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { CopilotoButton } from '../src/components/copiloto/CopilotoButton.jsx'
import { VoiceOrb } from '../src/components/copiloto/VoiceOrb.jsx'

describe('VoiceOrb & CopilotoButton (Siri Voice Assistant)', () => {
  it('renderiza la esfera VoiceOrb en estado IDLE por defecto', () => {
    const { container } = render(<VoiceOrb state="IDLE" size={70} />)
    const svgElement = container.querySelector('svg')
    expect(svgElement).toBeInTheDocument()
  })

  it('renderiza el botón flotante CopilotoButton con estados de voz', () => {
    render(<CopilotoButton state="SPEAKING" size={70} badgeText="Skynet hablando…" />)
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-label', 'Abrir chat de Skynet')
  })

  it('cambia la etiqueta a cerrar cuando el chat está abierto', () => {
    render(<CopilotoButton isOpen={true} size={70} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-label', 'Cerrar chat de Skynet')
  })
})
