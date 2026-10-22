import {
  listarNoticias,
  obtenerNoticia,
  listarCategorias,
  crearNoticia,
  actualizarNoticia,
  eliminarNoticia,
} from './noticias.service.js'
import { ErrorValidacion } from '../../utils/errores.js'

function parsearId(valor) {
  const id = Number(valor)
  if (!Number.isInteger(id) || id <= 0) throw new ErrorValidacion('Identificador de noticia inválido')
  return id
}

export async function listar(req, res) {
  const { page, limit, buscar, estado, categoria } = req.query
  const resultado = await listarNoticias({
    page: Math.max(1, Number(page) || 1),
    limit: Math.min(50, Math.max(1, Number(limit) || 20)),
    buscar: typeof buscar === 'string' ? buscar.trim().slice(0, 100) : undefined,
    estado: ['draft', 'publish', 'future'].includes(estado) ? estado : undefined,
    categoria: Number.isInteger(Number(categoria)) && Number(categoria) > 0 ? Number(categoria) : undefined,
  })
  res.json(resultado)
}

export async function obtener(req, res) {
  res.json({ noticia: await obtenerNoticia(parsearId(req.params.id)) })
}

export async function categorias(_req, res) {
  res.json({ categorias: await listarCategorias() })
}

export async function crear(req, res) {
  const noticia = await crearNoticia(req.body || {}, req.usuario, req.ip)
  res.status(201).json({ noticia })
}

export async function actualizar(req, res) {
  const noticia = await actualizarNoticia(parsearId(req.params.id), req.body || {}, req.usuario, req.ip)
  res.json({ noticia })
}

export async function eliminar(req, res) {
  await eliminarNoticia(parsearId(req.params.id), req.usuario, req.ip)
  res.status(204).end()
}
