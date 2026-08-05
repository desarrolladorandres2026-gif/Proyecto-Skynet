import { request } from './client.js'

// Datos que el usuario administra sobre sí mismo (no pasa por /usuarios, que
// es el módulo de administración). Hoy solo la firma manuscrita.
export const perfil = {
  firma() {
    return request('/perfil/firma')
  },
  // archivo: File del <input type="file">. Va como FormData porque es una
  // subida real a Cloudinary vía multer (ver Backend/src/modules/perfil).
  guardarFirma(archivo) {
    const body = new FormData()
    body.append('firma', archivo)
    return request('/perfil/firma', { method: 'PUT', body })
  },
  eliminarFirma() {
    return request('/perfil/firma', { method: 'DELETE' })
  },
}
