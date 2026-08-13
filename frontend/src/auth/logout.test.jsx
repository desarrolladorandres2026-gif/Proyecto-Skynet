import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { AuthProvider, useAuth } from './AuthContext.jsx'
import { auth } from '../api/auth.js'

// Regresión de BUG-004 (auditoría 2026-08-13). logout() llamaba a
// auth.logout() sin await y sin catch, y hacía setUsuario(null) de inmediato:
// si la petición que borra la cookie httpOnly fallaba, la UI iba al login como
// si la sesión se hubiera cerrado, pero la cookie seguía válida en el servidor
// hasta 8h — y al recargar, /auth/me la aceptaba y restauraba la sesión sola.

function Sonda() {
  const { usuario, logout } = useAuth()
  return (
    <div>
      <span data-testid="usuario">{usuario ? usuario.nombre_usuario : 'sin-sesion'}</span>
      <button
        type="button"
        onClick={async () => {
          const error = await logout()
          document.getElementById('error').textContent = error ?? ''
        }}
      >
        Cerrar sesión
      </button>
      <span id="error" data-testid="error" />
    </div>
  )
}

const USUARIO = { id_usuario: '1', nombre_usuario: 'ana', permisos: [], modulosDesactivados: [] }

describe('Cierre de sesión', () => {
  beforeEach(() => {
    // Se mockea getUsuarioLocal en vez de escribir en localStorage: Node 22
    // expone un `localStorage` global experimental que pisa el de jsdom y no
    // implementa setItem/clear, así que tocarlo aquí rompe por el entorno, no
    // por el código bajo prueba.
    vi.spyOn(auth, 'getUsuarioLocal').mockReturnValue(USUARIO)
    vi.spyOn(auth, 'me').mockResolvedValue(USUARIO)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('cierra la sesión cuando el backend confirma que borró la cookie', async () => {
    vi.spyOn(auth, 'logout').mockResolvedValue(undefined)
    render(<AuthProvider><Sonda /></AuthProvider>)
    await screen.findByText('ana')

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => expect(screen.getByTestId('usuario')).toHaveTextContent('sin-sesion'))
    expect(screen.getByTestId('error')).toHaveTextContent('')
  })

  it('NO da la sesión por cerrada si la petición falla, y devuelve el motivo', async () => {
    vi.spyOn(auth, 'logout').mockRejectedValue(new Error('Failed to fetch'))
    render(<AuthProvider><Sonda /></AuthProvider>)
    await screen.findByText('ana')

    fireEvent.click(screen.getByRole('button'))

    // Lo importante: la sesión sigue marcada como abierta. Fingir lo contrario
    // es justamente lo que dejaba la cuenta accesible al siguiente turno en un
    // equipo compartido.
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('Failed to fetch'))
    expect(screen.getByTestId('usuario')).toHaveTextContent('ana')
  })

  it('espera a que el backend responda antes de limpiar el usuario', async () => {
    let resolver
    vi.spyOn(auth, 'logout').mockReturnValue(new Promise((res) => { resolver = res }))
    render(<AuthProvider><Sonda /></AuthProvider>)
    await screen.findByText('ana')

    fireEvent.click(screen.getByRole('button'))

    // Petición en vuelo: la sesión NO puede darse por cerrada todavía.
    expect(screen.getByTestId('usuario')).toHaveTextContent('ana')
    await act(async () => { resolver() })
    await waitFor(() => expect(screen.getByTestId('usuario')).toHaveTextContent('sin-sesion'))
  })
})
