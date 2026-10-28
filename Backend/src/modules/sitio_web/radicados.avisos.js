import SeguimientoRadicados from '../../models/SeguimientoRadicados.js'
import { notificarUsuarios } from '../../utils/sendPush.js'
import { usuariosConPermiso } from '../mantenimiento/comun.js'
import { wpConfigurado, wpRequest } from './wp.client.js'

// Aviso de radicados (PQRS) nuevos. Los radicados los crea el formulario
// público en WordPress, sin pasar por Skynet, así que no hay un punto de
// código donde "engancharse": el worker (radicados.worker.js) consulta el
// listado cada pocos minutos y avisa de todo id mayor al último ya avisado.

const PERMISO_PQRS = 'pqrs:gestionar'
const URL_BANDEJA = '/sitio-web/radicados'
// Una página de 50 cubre de sobra el ritmo del sitio entre dos consultas; si
// alguna vez llegaran más de 50 de golpe, los más viejos quedarían sin aviso
// individual pero la bandeja de Skynet los sigue mostrando todos.
const POR_PAGINA = 50
// Más de esto en una sola vuelta (p. ej. tras una caída larga del servidor) se
// resume en un único aviso para no inundar de correos al equipo.
const MAX_AVISOS_INDIVIDUALES = 3

function detallesDeRadicado(r) {
  return [
    { etiqueta: 'Radicado', valor: r.radicado },
    { etiqueta: 'Formulario', valor: r.formulario?.titulo },
    { etiqueta: 'Tipo', valor: r.resumen?.tipo },
    { etiqueta: 'Asunto', valor: r.resumen?.asunto },
    { etiqueta: 'Solicitante', valor: r.resumen?.solicitante },
  ]
}

function payloadIndividual(r) {
  const quien = r.resumen?.solicitante ? ` de ${r.resumen.solicitante}` : ''
  return {
    title: 'Nuevo radicado en el sitio web',
    body: `${r.formulario?.titulo || 'Formulario'}${quien} (${r.radicado})`,
    url: URL_BANDEJA,
    detalles: detallesDeRadicado(r),
  }
}

function payloadResumen(nuevos) {
  return {
    title: `${nuevos.length} radicados nuevos en el sitio web`,
    body: `Llegaron ${nuevos.length} solicitudes nuevas. Revísalas en la bandeja de radicados.`,
    url: URL_BANDEJA,
    detalles: [{ etiqueta: 'Radicados', valor: nuevos.map((r) => r.radicado).join(', ') }],
  }
}

/**
 * Una vuelta del worker. Devuelve cuántos radicados nuevos avisó.
 *
 * La primera vez (sin marca guardada) solo fija el id actual como punto de
 * partida: avisar los radicados históricos como "nuevos" sería ruido.
 */
export async function avisarRadicadosNuevos() {
  if (!wpConfigurado()) return 0

  const { data } = await wpRequest('GET', '/skynet/v1/radicados', { query: { page: 1, per_page: POR_PAGINA } })
  const items = data?.items || []
  const idMaximo = items.reduce((max, r) => Math.max(max, r.id), 0)

  const seguimiento = await SeguimientoRadicados.findOne({ clave: 'global' })
  if (!seguimiento) {
    // Dos procesos arrancando a la vez: el índice único deja ganar a uno.
    await SeguimientoRadicados.create({ clave: 'global', ultimoId: idMaximo }).catch((err) => {
      if (err.code !== 11000) throw err
    })
    return 0
  }

  const nuevos = items.filter((r) => r.id > seguimiento.ultimoId).sort((a, b) => a.id - b.id)
  if (!nuevos.length) return 0

  // La marca avanza ANTES de avisar y de forma condicional: si dos vueltas se
  // solapan solo una "reclama" estos radicados y nadie recibe el aviso doble.
  const reclamado = await SeguimientoRadicados.findOneAndUpdate(
    { clave: 'global', ultimoId: seguimiento.ultimoId },
    { $set: { ultimoId: idMaximo } },
  )
  if (!reclamado) return 0

  const destinatarios = await usuariosConPermiso(PERMISO_PQRS)
  const avisos = nuevos.length > MAX_AVISOS_INDIVIDUALES ? [payloadResumen(nuevos)] : nuevos.map(payloadIndividual)
  for (const payload of avisos) await notificarUsuarios(destinatarios, payload, 'pqrs')
  return nuevos.length
}
