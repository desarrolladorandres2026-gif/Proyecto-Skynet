import { estaModuloActivo } from '../modules/sistema/sistema.service.js'
import { MODULOS_SISTEMA } from '../seedData/modulos.data.js'

const NOMBRES = new Map(MODULOS_SISTEMA.map((m) => [m.key, m.nombre]))

// Gate de módulo desactivado: se monta ANTES de requierePermiso en las rutas
// de los módulos desactivables (danos, flota, operacion, mantenimiento,
// sigittn). Un módulo apagado por el Super Admin queda apagado para TODOS los
// roles, incluido el propio Super Admin: la única forma de volver a usarlo es
// reactivarlo desde /sistema/modulos (que es núcleo y no se puede apagar).
//
// Como verificarToken, este middleware se monta con router.use() en algunos
// módulos y safeRouter NO envuelve router.use(): captura sus propios errores
// async y los pasa a next(err) explícitamente.
export function requiereModuloActivo(key) {
  return async (_req, res, next) => {
    try {
      if (await estaModuloActivo(key)) return next()
      res.status(403).json({
        error: `El módulo "${NOMBRES.get(key) || key}" está desactivado por el administrador del sistema`,
        moduloDesactivado: key,
      })
    } catch (err) {
      next(err)
    }
  }
}
