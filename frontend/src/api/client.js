const BASE = import.meta.env.VITE_API_URL || '/api'

// El token de sesión vive en una cookie httpOnly puesta por el backend: este
// código JS nunca la lee ni la escribe (por diseño, para que un XSS no pueda
// robarla). "usuario" en localStorage es solo un dato NO sensible (nombre,
// rol, módulos) para pintar la UI al instante mientras se confirma /auth/me.
export function removeUsuarioLocal() {
  localStorage.removeItem('skynet_usuario')
}

export async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...options.headers,
  }

  // credentials:'include' hace que el navegador adjunte la cookie httpOnly de
  // sesión en cada petición (y acepte la que ponga el backend en /login).
  const res = await fetch(`${BASE}${path}`, { ...options, headers, credentials: 'include' })

  // Un 401 significa que la cookie ya no es válida (expiró, se invalidó por un
  // reset de contraseña, o el usuario fue desactivado/eliminado): limpia el
  // estado local y notifica a la app para que redirija a /login.
  //
  // options.suppressAuthEvent evita esto para la comprobación anónima inicial
  // de /auth/me (sin sesión aún): antes se distinguía por "¿hay token en
  // localStorage?", pero el token ahora vive en una cookie httpOnly invisible
  // para este código. Sin la supresión, esa sonda inicial (que corre en
  // paralelo a un posible login manual) podría dispatchear skynet:logout y
  // borrar el usuario que el login manual acaba de establecer.
  if (res.status === 401 && !options.suppressAuthEvent) {
    removeUsuarioLocal()
    window.dispatchEvent(new Event('skynet:logout'))
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
  return data
}
