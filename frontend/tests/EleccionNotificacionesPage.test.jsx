import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import EleccionNotificacionesPage from '../src/modules/notificaciones/EleccionNotificacionesPage.jsx'
import { notificaciones as notificacionesApi } from '../src/api/notificaciones.js'

vi.mock('../src/api/notificaciones.js', () => ({
  notificaciones: {
    configuracionCanales: vi.fn(),
    actualizarConfiguracionCanales: vi.fn(),
    categorias: vi.fn(),
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  notificacionesApi.configuracionCanales.mockResolvedValue({
    emailGlobal: { activo: true },
    pushGlobal: { activo: true },
    canales: {
      sig_pregunta_dia: { email: true, push: true, activo: true },
      requerimientos: { email: true, push: true, activo: true },
    },
  })
  notificacionesApi.categorias.mockResolvedValue({
    categorias: [
      { key: 'sig_pregunta_dia', nombre: 'Cuestionarios Programados', descripcion: 'Pregunta SIG diaria' },
      { key: 'requerimientos', nombre: 'Requerimientos', descripcion: 'Solicitudes y compras' },
    ],
  })
  notificacionesApi.actualizarConfiguracionCanales.mockResolvedValue({
    emailGlobal: { activo: true },
    pushGlobal: { activo: true },
    canales: {
      sig_pregunta_dia: { email: false, push: true, activo: true },
      requerimientos: { email: true, push: true, activo: true },
    },
  })
})

describe('EleccionNotificacionesPage', () => {
  it('renderiza título, pestañas, banner de ahorro de Resend y categorías', async () => {
    render(
      <MemoryRouter>
        <EleccionNotificacionesPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Elección de notificaciones' })).toBeInTheDocument()
      expect(screen.getByText('Cuestionarios Programados')).toBeInTheDocument()
      expect(screen.getByText('Modo Ahorro Cuota (Recomendado)')).toBeInTheDocument()
    })
  })

  it('al presionar "Solo Dispositivo" en Cuestionarios SIG envía email:false y push:true', async () => {
    render(
      <MemoryRouter>
        <EleccionNotificacionesPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Cuestionarios Programados')).toBeInTheDocument())

    // Encontrar el botón Solo Dispositivo específico de la fila de la categoría (no del preset superior)
    const fila = screen.getByText('Cuestionarios Programados').closest('.rounded-2xl')
    const btnSoloDispositivo = fila.querySelector('button[title*="teléfono"]') || screen.getAllByRole('button', { name: /solo dispositivo/i })[1]
    fireEvent.click(btnSoloDispositivo)

    await waitFor(() => {
      expect(notificacionesApi.actualizarConfiguracionCanales).toHaveBeenCalledWith({
        canales: {
          sig_pregunta_dia: { email: false, push: true, activo: true },
        },
      })
    })
  })

  it('al presionar preset "Modo Ahorro Cuota", configura categorías de alto volumen en solo dispositivo', async () => {
    render(
      <MemoryRouter>
        <EleccionNotificacionesPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Modo Ahorro Cuota (Recomendado)')).toBeInTheDocument())

    const btnPreset = screen.getByText('Modo Ahorro Cuota (Recomendado)')
    fireEvent.click(btnPreset)

    await waitFor(() => {
      expect(notificacionesApi.actualizarConfiguracionCanales).toHaveBeenCalledWith(
        expect.objectContaining({
          emailGlobal: { activo: true },
          pushGlobal: { activo: true },
          canales: expect.objectContaining({
            sig_pregunta_dia: { email: false, push: true, activo: true },
            requerimientos: { email: true, push: true, activo: true },
          }),
        })
      )
    })
  })

  it('al cambiar el switch maestro de email global, actualiza emailGlobal.activo', async () => {
    render(
      <MemoryRouter>
        <EleccionNotificacionesPage />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByText('Transmisión por Correo (Resend)')).toBeInTheDocument())

    const switches = screen.getAllByRole('switch')
    fireEvent.click(switches[0]) // email maestro

    await waitFor(() => {
      expect(notificacionesApi.actualizarConfiguracionCanales).toHaveBeenCalledWith({
        emailGlobal: { activo: false },
      })
    })
  })
})
