import { request } from './client.js'

export const dashboard = {
  resumen: () => request('/dashboard'),
}
