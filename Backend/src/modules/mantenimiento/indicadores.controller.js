import { obtenerIndicadoresPersonales } from './indicadores.service.js'
import { ErrorConflicto } from '../../utils/errores.js'

export async function indicadores(req, res) {
  const { tecnicoId, desde, hasta } = req.query
  let objetivo = req.usuario.id_usuario

  if (tecnicoId && String(tecnicoId) !== String(req.usuario.id_usuario)) {
    // Consultar los indicadores de OTRO técnico exige visibilidad de supervisor.
    if (!req.usuario.esSuperAdmin && !req.usuario.permisos?.has('mantenimiento:ver_todas')) {
      throw new ErrorConflicto('No tienes permiso para ver los indicadores de otro técnico')
    }
    objetivo = tecnicoId
  }

  const datos = await obtenerIndicadoresPersonales(objetivo, { desde, hasta })
  res.json(datos)
}
