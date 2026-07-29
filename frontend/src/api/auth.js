import { request, removeUsuarioLocal } from './client.js'

export const auth = {
  async login(email, password) {
    // El backend responde con Set-Cookie (httpOnly) para la sesión; aquí solo
    // se guarda el perfil del usuario (no sensible) para pintar la UI.
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    localStorage.setItem('skynet_usuario', JSON.stringify(data.usuario))
    return data.usuario
  },
  async logout() {
    // Le pide al backend que borre la cookie httpOnly: el frontend no puede
    // hacerlo por sí mismo (por diseño, para que un XSS tampoco pueda).
    try {
      await request('/auth/logout', { method: 'POST' })
    } finally {
      removeUsuarioLocal()
    }
  },
  getUsuarioLocal() {
    try {
      return JSON.parse(localStorage.getItem('skynet_usuario'))
    } catch {
      return null
    }
  },
  async me() {
    // suppressAuthEvent: esta es la sonda anónima de sesión al arrancar la
    // app; su 401 (sin sesión) lo maneja AuthContext directamente y no debe
    // disparar el evento global skynet:logout (ver client.js).
    const data = await request('/auth/me', { suppressAuthEvent: true })
    return data.usuario
  },
}

export const resetPassword = {
  solicitar(nombre_usuario, email) {
    return request('/auth/solicitar-reset', {
      method: 'POST',
      body: JSON.stringify({ nombre_usuario, email }),
    })
  },
  validarToken(token) {
    return request(`/auth/validar-token?token=${encodeURIComponent(token)}`)
  },
  restablecer(token, nueva_password) {
    return request('/auth/restablecer-password', {
      method: 'POST',
      body: JSON.stringify({ token, nueva_password }),
    })
  },
}
