export const backup = {
  async exportar() {
    const BASE = import.meta.env.VITE_API_URL || '/api'
    const res = await fetch(`${BASE}/backup/exportar`, { credentials: 'include' })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw new Error(data?.error || `Error ${res.status}`)
    }
    const blob = await res.blob()
    const nombreCabecera = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1]
    return { blob, nombre: nombreCabecera || 'skynet-backup.xlsx' }
  },
}
