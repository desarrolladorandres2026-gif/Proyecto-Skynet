import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { useNovedades } from './useNovedades.js'
import { leerVistas } from '../lib/novedades.js'

vi.mock('../auth/AuthContext.jsx', () => ({
  useAuth: () => ({ usuario: { id_usuario: 42 } }),
}))

const nuevo = { to: '/nuevo', label: 'Nuevo', nuevoHasta: '2999-01-01' }
const vencido = { to: '/vencido', label: 'Vencido', nuevoHasta: '2000-01-01' }
const normal = { to: '/normal', label: 'Normal' }
const modulos = [{ key: 'm', label: 'M', items: [nuevo, vencido, normal] }]

function montar(ruta) {
  // useNavigate en el mismo árbol para poder "visitar" rutas dentro del test.
  return renderHook(
    () => ({ novedades: useNovedades(modulos), navegar: useNavigate() }),
    { wrapper: ({ children }) => <MemoryRouter initialEntries={[ruta]}>{children}</MemoryRouter> }
  )
}

beforeEach(() => localStorage.clear())

describe('useNovedades', () => {
  it('marca como nuevo solo lo vigente y no visitado', () => {
    const { result } = montar('/dashboard')
    const { esNueva, moduloTieneNovedad } = result.current.novedades
    expect(esNueva(nuevo)).toBe(true)
    expect(esNueva(vencido)).toBe(false)
    expect(esNueva(normal)).toBe(false)
    expect(moduloTieneNovedad(modulos[0])).toBe(true)
  })

  it('visitar la ruta apaga el punto y lo recuerda para ese usuario', () => {
    const { result } = montar('/dashboard')
    act(() => result.current.navegar('/nuevo'))
    expect(result.current.novedades.esNueva(nuevo)).toBe(false)
    expect(result.current.novedades.moduloTieneNovedad(modulos[0])).toBe(false)
    expect(leerVistas(42).has('/nuevo')).toBe(true)
  })

  it('entrar directo por la URL también cuenta como visto', () => {
    const { result } = montar('/nuevo')
    expect(result.current.novedades.esNueva(nuevo)).toBe(false)
  })

  it('un punto ya visto no reaparece al volver a montar', () => {
    montar('/nuevo').unmount()
    const { result } = montar('/dashboard')
    expect(result.current.novedades.esNueva(nuevo)).toBe(false)
  })

  it('visitar otra ruta no apaga el punto de ésta', () => {
    const { result } = montar('/dashboard')
    act(() => result.current.navegar('/normal'))
    expect(result.current.novedades.esNueva(nuevo)).toBe(true)
  })
})
