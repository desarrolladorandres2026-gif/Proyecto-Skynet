import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { MasSheetContent } from './MobileShell.jsx'
import { MODULOS_REGISTRO } from '../config/modulosRegistry.js'

// Simula lo que vería un Super Admin: todos los módulos, todos los items.
const modulosVisibles = MODULOS_REGISTRO
const rutasOcultas = new Set(['/dashboard'])

function renderSheet(onNavigate = vi.fn()) {
  render(
    <MemoryRouter>
      <MasSheetContent modulosVisibles={modulosVisibles} rutasOcultas={rutasOcultas} onNavigate={onNavigate} />
    </MemoryRouter>
  )
}

describe('MasSheetContent', () => {
  it('arranca con los grupos multi-item colapsados (no expande Email de una)', () => {
    renderSheet()
    expect(screen.getByText('Email')).toBeInTheDocument()
    expect(screen.queryByText('Bandeja de entrada')).not.toBeInTheDocument()
  })

  it('un tap en el grupo lo despliega, y otro tap lo vuelve a cerrar', () => {
    renderSheet()
    fireEvent.click(screen.getByText('Email'))
    expect(screen.getByText('Bandeja de entrada')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Email'))
    expect(screen.queryByText('Bandeja de entrada')).not.toBeInTheDocument()
  })

  it('un grupo de un solo item navega directo, sin paso de expandir', () => {
    renderSheet()
    const enlace = screen.getByRole('link', { name: /Usuarios/i })
    expect(enlace).toHaveAttribute('href', '/usuarios')
  })

  it('oculta el módulo "Panel" (dashboard) porque ya vive en la barra inferior', () => {
    renderSheet()
    expect(screen.queryByText('Panel de Control')).not.toBeInTheDocument()
  })

  it('buscar muestra el resultado ya expandido, sin tap extra', () => {
    renderSheet()
    const buscador = screen.getByPlaceholderText('Buscar módulo...')
    fireEvent.change(buscador, { target: { value: 'bandeja de entrada' } })
    expect(screen.getByText('Bandeja de entrada')).toBeInTheDocument()
    // "Requerimientos" también tiene items con "bandeja" en el label
    // (Bandeja Financiero / Bandeja Bodega) pero no calzan con la frase
    // completa, así que ese grupo no debería aparecer.
    expect(screen.queryByText('Requerimientos')).not.toBeInTheDocument()
  })

  it('la búsqueda es insensible a tildes ("auditoria" encuentra "Auditoría")', () => {
    renderSheet()
    const buscador = screen.getByPlaceholderText('Buscar módulo...')
    fireEvent.change(buscador, { target: { value: 'auditoria' } })
    expect(screen.getByText('Auditoría')).toBeInTheDocument()
  })

  it('tocar un item navega y avisa via onNavigate', () => {
    const onNavigate = vi.fn()
    renderSheet(onNavigate)
    fireEvent.click(screen.getByText('Email'))
    fireEvent.click(screen.getByText('Bandeja de entrada'))
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })
})
