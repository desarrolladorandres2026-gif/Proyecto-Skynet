import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, renderHook, act, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NotificacionesBell } from '../src/components/notificaciones/NotificacionesBell.jsx'
import { useCentroNotificaciones } from '../src/components/notificaciones/useCentroNotificaciones.js'
import { TooltipProvider } from '../src/components/Tooltip.jsx'
import { notificaciones as notificacionesApi } from '../src/api/notificaciones.js'

vi.mock('../src/api/notificaciones.js', () => ({
  notificaciones: {
    noLeidas: vi.fn(),
    misNotificaciones: vi.fn(),
    marcarLeida: vi.fn(),
    marcarTodasLeidas: vi.fn(),
  },
}))

function renderBell() {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <NotificacionesBell />
      </TooltipProvider>
    </MemoryRouter>
  )
}

const NOTIFS = [
  { _id: 'n1', titulo: 'Requerimiento aprobado', cuerpo: 'Bodega despachó tu pedido', categoria: 'requerimientos', leida: false, url: '/requerimientos/1', createdAt: new Date().toISOString() },
  { _id: 'n2', titulo: 'Aviso leído', cuerpo: 'Ya lo viste', categoria: 'danos', leida: true, url: null, createdAt: new Date().toISOString() },
]

beforeEach(() => {
  vi.clearAllMocks()
  notificacionesApi.noLeidas.mockResolvedValue({ total: 2 })
  notificacionesApi.misNotificaciones.mockResolvedValue({ notificaciones: NOTIFS, total: 2, page: 1, pages: 1 })
  notificacionesApi.marcarLeida.mockResolvedValue({})
  notificacionesApi.marcarTodasLeidas.mockResolvedValue({ actualizadas: 1 })
})

describe('NotificacionesBell (render)', () => {
  it('muestra el contador de no leídas al montar, sin recargar toda la página', async () => {
    renderBell()
    await waitFor(() => expect(screen.getByLabelText('Notificaciones, 2 sin leer')).toBeInTheDocument())
    expect(screen.getByText('2')).toBeInTheDocument()
    // El contador se pinta sin ningún reload/navegación: solo con lo que
    // devolvió noLeidas().
    expect(notificacionesApi.noLeidas).toHaveBeenCalledTimes(1)
  })

  it('no aparece ningún badge cuando no hay notificaciones sin leer', async () => {
    notificacionesApi.noLeidas.mockResolvedValue({ total: 0 })
    renderBell()
    await waitFor(() => expect(notificacionesApi.noLeidas).toHaveBeenCalled())
    expect(screen.getByLabelText('Notificaciones')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('abre el menú desplegable al interactuar con el botón de la campana', async () => {
    renderBell()
    const boton = await screen.findByRole('button', { name: /Notificaciones/i })
    fireEvent.keyDown(boton, { key: 'Enter' })

    await waitFor(() => expect(screen.getByText('Requerimiento aprobado')).toBeInTheDocument())
    expect(notificacionesApi.misNotificaciones).toHaveBeenCalled()
  })
})

describe('useCentroNotificaciones (comportamiento)', () => {
  it('carga el contador al montar y la lista al llamar cargarLista()', async () => {
    const { result } = renderHook(() => useCentroNotificaciones())

    await waitFor(() => expect(result.current.noLeidas).toBe(2))
    expect(result.current.notificaciones).toEqual([])

    await act(async () => {
      await result.current.cargarLista()
    })
    expect(result.current.notificaciones).toHaveLength(2)
    expect(notificacionesApi.misNotificaciones).toHaveBeenCalledWith({ page: 1, limit: 15 })
  })

  it('marcarLeida actualiza el estado local al instante (optimista) y llama al API con el id correcto', async () => {
    const { result } = renderHook(() => useCentroNotificaciones())
    await waitFor(() => expect(result.current.noLeidas).toBe(2))
    await act(async () => {
      await result.current.cargarLista()
    })

    await act(async () => {
      await result.current.marcarLeida('n1')
    })

    expect(notificacionesApi.marcarLeida).toHaveBeenCalledWith('n1')
    expect(result.current.notificaciones.find((n) => n._id === 'n1').leida).toBe(true)
    expect(result.current.noLeidas).toBe(1)
  })

  it('marcarTodasLeidas pone el contador en 0 y marca todo localmente', async () => {
    const { result } = renderHook(() => useCentroNotificaciones())
    await waitFor(() => expect(result.current.noLeidas).toBe(2))
    await act(async () => {
      await result.current.cargarLista()
    })

    await act(async () => {
      await result.current.marcarTodasLeidas()
    })

    expect(notificacionesApi.marcarTodasLeidas).toHaveBeenCalledTimes(1)
    expect(result.current.noLeidas).toBe(0)
    expect(result.current.notificaciones.every((n) => n.leida)).toBe(true)
  })

  it('refrescarContador responde al mensaje SKYNET_PUSH_RECEIVED del Service Worker', async () => {
    const listeners = {}
    const swMock = { addEventListener: vi.fn((evento, cb) => { listeners[evento] = cb }), removeEventListener: vi.fn() }
    Object.defineProperty(navigator, 'serviceWorker', { value: swMock, configurable: true })

    notificacionesApi.noLeidas.mockResolvedValueOnce({ total: 2 }).mockResolvedValueOnce({ total: 5 })
    const { result } = renderHook(() => useCentroNotificaciones())
    await waitFor(() => expect(result.current.noLeidas).toBe(2))

    await act(async () => {
      listeners.message({ data: { type: 'SKYNET_PUSH_RECEIVED' } })
      await Promise.resolve()
    })

    await waitFor(() => expect(result.current.noLeidas).toBe(5))
    expect(notificacionesApi.noLeidas).toHaveBeenCalledTimes(2)
  })
})
