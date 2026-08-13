import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from './LoginPage.jsx'
import { AuthProvider } from './AuthContext.jsx'
import { auth } from '../api/auth.js'

describe('LoginPage - Efecto de verificación y acceso', () => {
  beforeEach(() => {
    vi.spyOn(auth, 'getUsuarioLocal').mockReturnValue(null)
    vi.spyOn(auth, 'me').mockRejectedValue(new Error('Sin sesion'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('muestra el formulario inicial y permite escribir credenciales', () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    )

    expect(screen.getByLabelText(/correo/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument()
  })

  it('inicia la secuencia de verificación y acceso concedido al autenticar exitosamente', async () => {
    const usuarioMock = {
      id_usuario: '1',
      nombre_usuario: 'admin_skynet',
      rol: { nombre: 'Super Administrador', slug: 'administrador' },
      permisos: [],
    }

    vi.spyOn(auth, 'login').mockResolvedValue(usuarioMock)

    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/correo/i), {
      target: { value: 'admin@skynet.com' },
    })
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'password123' },
    })

    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    // Verifica que se muestre la secuencia épica de acceso concedido
    await waitFor(() => {
      expect(screen.getByText(/ACCESO CONCEDIDO/i)).toBeInTheDocument()
      expect(screen.getByText(/SKYNET PROTOCOL ONLINE/i)).toBeInTheDocument()
      expect(screen.getByText(/admin_skynet/i)).toBeInTheDocument()
    })
  })

  it('muestra mensaje de error cuando las credenciales son incorrectas', async () => {
    vi.spyOn(auth, 'login').mockRejectedValue(new Error('Credenciales inválidas'))

    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>
    )

    fireEvent.change(screen.getByLabelText(/correo/i), {
      target: { value: 'error@skynet.com' },
    })
    fireEvent.change(screen.getByLabelText(/contraseña/i), {
      target: { value: 'wrongpass' },
    })

    fireEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }))

    await waitFor(() => {
      expect(screen.getByText(/ERROR: Credenciales inválidas/i)).toBeInTheDocument()
    })
  })
})
