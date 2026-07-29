import * as repo from './permisos.repository.js'

// Agrupados por módulo: es la forma que consume la matriz módulo × acción de
// RolesPage en el frontend.
export async function listarPermisosAgrupados() {
  const permisos = await repo.listar()
  const agrupados = new Map()

  for (const p of permisos) {
    if (!agrupados.has(p.modulo)) agrupados.set(p.modulo, [])
    agrupados.get(p.modulo).push({ codigo: p.codigo, accion: p.accion, nombre: p.nombre })
  }

  return Array.from(agrupados, ([modulo, permisos]) => ({ modulo, permisos }))
}
