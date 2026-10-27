// Roles que ya tenían panel de escritorio cuando Rol.panelEscritorio no
// existía (lista que vivía hardcodeada en el frontend, usaPanelDenso). Solo se
// consulta mientras el rol no tenga el campo guardado en la BD; el script
// scripts/migrar-panel-escritorio.js lo materializa y a partir de ahí manda el
// valor que se elige en Roles.
const SLUGS_PANEL_LEGADO = [
  'administrador',
  'bodega',
  'administrativo_financiero',
  'sig_hseq',
  'comunicador',
  'secretaria_gerencia',
  'seguridad',
]

// Super Admin siempre tiene panel: no es configurable.
export function tienePanelEscritorio(rol) {
  if (rol?.esSuperAdmin === true) return true
  if (typeof rol?.panelEscritorio === 'boolean') return rol.panelEscritorio
  return SLUGS_PANEL_LEGADO.includes(rol?.slug)
}
