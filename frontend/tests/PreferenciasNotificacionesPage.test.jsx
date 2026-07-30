import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import PreferenciasNotificacionesPage from '../src/modules/notificaciones/PreferenciasNotificacionesPage.jsx'
import { notificaciones as notificacionesApi } from '../src/api/notificaciones.js'

vi.mock('../src/api/notificaciones.js', () => ({
  notificaciones: {
    preferencias: vi.fn(),
    categorias: vi.fn(),
    misDispositivos: vi.fn(),
    actualizarPreferencias: vi.fn(),
    olvidarDispositivo: vi.fn(),
    vapidPublicKey: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  notificacionesApi.preferencias.mockResolvedValue({
    email: { activo: true },
    push: { activo: true },
    categorias: { soporte: true },
  })
  notificacionesApi.categorias.mockResolvedValue({
    categorias: [{ key: 'soporte', nombre: 'Soporte', descripcion: 'Tickets y mensajes' }],
  })
  notificacionesApi.misDispositivos.mockResolvedValue({ dispositivos: [] })
  notificacionesApi.actualizarPreferencias.mockResolvedValue({})
})

describe('PreferenciasNotificacionesPage', () => {
  it('carga preferencias y categorías, y guarda de inmediato al togglear un canal', async () => {
    render(<PreferenciasNotificacionesPage />)

    await waitFor(() => expect(screen.getByText('Soporte')).toBeInTheDocument())

    // Orden de renderizado: correo, push, luego un switch por categoría.
    const switches = screen.getAllByRole('switch')
    fireEvent.click(switches[0])

    await waitFor(() =>
      expect(notificacionesApi.actualizarPreferencias).toHaveBeenCalledWith({ email: { activo: false } })
    )
  })

  it('togglear una categoría manda solo esa clave', async () => {
    render(<PreferenciasNotificacionesPage />)
    await waitFor(() => expect(screen.getByText('Soporte')).toBeInTheDocument())

    const switches = screen.getAllByRole('switch')
    fireEvent.click(switches[2]) // 0=correo, 1=push, 2=primera categoría

    await waitFor(() =>
      expect(notificacionesApi.actualizarPreferencias).toHaveBeenCalledWith({ categorias: { soporte: false } })
    )
  })

  it('muestra "Sin dispositivos" cuando la lista viene vacía', async () => {
    render(<PreferenciasNotificacionesPage />)
    await waitFor(() => expect(screen.getByText('No tienes dispositivos suscritos todavía')).toBeInTheDocument())
  })
})
