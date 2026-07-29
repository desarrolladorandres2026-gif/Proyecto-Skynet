import Permiso from '../models/Permiso.js'
import Rol from '../models/Rol.js'
import { PERMISOS, ROLES } from './rbac.data.js'

// Idempotente (upsert por código/slug). Usado tanto por scripts/seed.js
// (primer arranque) como por scripts/migrate-rbac-roles.js (migración de
// usuarios legados) para que el catálogo de Roles/Permisos nunca diverja
// entre ambos caminos.
export async function sembrarCatalogoRBAC() {
  const permisoIdPorCodigo = new Map()
  for (const p of PERMISOS) {
    const doc = await Permiso.findOneAndUpdate({ codigo: p.codigo }, p, { upsert: true, new: true })
    permisoIdPorCodigo.set(p.codigo, doc._id)
  }

  const rolIdPorSlug = new Map()
  for (const r of ROLES) {
    const permisos = r.permisos.map((codigo) => {
      const id = permisoIdPorCodigo.get(codigo)
      if (!id) throw new Error(`Permiso "${codigo}" referenciado por el rol "${r.slug}" no existe en PERMISOS`)
      return id
    })
    const doc = await Rol.findOneAndUpdate({ slug: r.slug }, { ...r, permisos }, { upsert: true, new: true })
    rolIdPorSlug.set(r.slug, doc._id)
  }

  return rolIdPorSlug
}
