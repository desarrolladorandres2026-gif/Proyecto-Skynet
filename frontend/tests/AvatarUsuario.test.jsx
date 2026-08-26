import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { AvatarUsuario, AVATAR_PREDETERMINADO } from '../src/components/AvatarUsuario.jsx'

describe('AvatarUsuario', () => {
  it('renderiza la imagen predeterminada claro.png si no se proporciona src', () => {
    render(<AvatarUsuario usuario={{ nombre: 'Carlos Gomez' }} />)
    const img = screen.getByRole('img')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', AVATAR_PREDETERMINADO)
    expect(img).toHaveAttribute('alt', 'Carlos Gomez')
  })

  it('renderiza con las clases y estilos circulares adecuados', () => {
    render(<AvatarUsuario className="h-10 w-10" />)
    const img = screen.getByRole('img')
    expect(img).toHaveClass('rounded-full')
    expect(img).toHaveClass('h-10')
    expect(img).toHaveClass('w-10')
  })
})
