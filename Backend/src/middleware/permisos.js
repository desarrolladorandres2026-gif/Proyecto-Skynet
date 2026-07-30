// Middleware de autorización granular para los módulos del ERP nuevo
// (a diferencia de soloAdmin/requireModulo en auth.js, que son el esquema
// binario legado que sigue gobernando mantenimiento/usuarios).
export function requierePermiso(...codigos) {
  return (req, res, next) => {
    if (req.usuario?.esSuperAdmin) return next()
    const tiene = codigos.some((c) => req.usuario?.permisos?.has(c))
    if (!tiene) {
      return res.status(403).json({ error: `No tienes el permiso requerido: ${codigos.join(' o ')}` })
    }
    next()
  }
}

// Complementa a requierePermiso para el scoping multi-tenant de "Empresa
// Transportadora" (y cualquier rol futuro con ambito:'empresa'). Los módulos
// de Fase 1+ (vehículos, conductores, rutas, horarios) lo montan tras
// verificarToken y usan req.scope en su repository para filtrar/forzar la
// empresa del usuario. El Service de cada módulo debe ignorar/sobrescribir
// cualquier empresaId que venga en el body — nunca confiar en el cliente
// para el tenant.
export function cargarScopeEmpresa(req, res, next) {
  req.scope = req.usuario?.rol?.ambito === 'empresa' ? { empresaId: req.usuario.empresaId } : {}
  next()
}
