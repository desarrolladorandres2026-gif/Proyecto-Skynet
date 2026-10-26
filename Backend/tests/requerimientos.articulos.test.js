import { describe, it, expect, vi } from 'vitest'
import bcrypt from 'bcryptjs'

vi.mock('../src/utils/webpush.js', () => ({ default: { sendNotification: vi.fn() } }))
vi.mock('../src/utils/email.js', () => ({ enviarEmailGenerico: vi.fn() }))

import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import Articulo from '../src/models/Articulo.js'
import {
  crearRequerimiento,
  aprobarComoFinanciero,
  consolidadoDespacho,
  vincularItemArticulo,
} from '../src/modules/requerimientos/requerimientos.service.js'
import {
  importarExistencias,
  parsearExportElisa,
  buscarParaSolicitante,
  editarArticulo,
} from '../src/modules/requerimientos/articulos.service.js'
import { buscar, normalizar } from '../src/modules/requerimientos/articulos.busqueda.js'

// Mismo formato de columnas fijas del export real de Elisa, incluyendo el
// doble espacio interno, el nombre truncado, el duplicado y la fila de total.
const EXPORT = [
  '                                                                EXISTENCIAS           COSTOS  ',
  'ARTÍCULO                                  NOMBRE DEL GRUPO             FINAL            ',
  'ESCOBA                                    ASEO                         20               ',
  'ESCOBA CERDA DURA                         ASEO                         5                ',
  'LIMPIDO 3.8 LITROS                        ASEO                         0                ',
  'TENI DAMA  TALLA 41                       DOTACION                     0                ',
  'BOLSA NEGRA JUMBO X 10 UNIDADES           ASEO                         223              ',
  'VENTILADOR AIR PRO                        ACTIVOS MENOR CUANTI         0                ',
  'VENTILADOR AIR PRO                        ACTIVOS MENOR CUANTI         2                ',
  'NO USAR                                   MANTENIMIENTO                0                ',
  'PAPEL HIGIENICO CAJA                      BATERIAS SANITARIAS          184,427          ',
  '                                                                       243,110.00            ',
].join('\n')

async function actorConPermisos(codigos, { conFirma = false } = {}) {
  const sufijo = Math.random().toString(36).slice(2)
  const rol = await Rol.create({ nombre: `Rol-${sufijo}`, slug: `rol-${sufijo}`, permisos: [] })
  const password = 'clave-segura-123'
  const usuario = await Usuario.create({
    nombre_usuario: `user-${sufijo}`,
    nombre: `Usuario ${sufijo}`,
    password: await bcrypt.hash(password, 4),
    email: `${sufijo}@example.com`,
    rol: rol._id,
    cargo: 'Tester',
    firma: conFirma ? { url: 'https://res.cloudinary.com/test/firma.png', publicId: `test/${sufijo}` } : undefined,
  })
  return {
    password,
    actor: {
      id_usuario: usuario._id,
      nombre_usuario: usuario.nombre_usuario,
      rol: { id: rol._id, nombre: rol.nombre, slug: rol.slug },
      esSuperAdmin: false,
      permisos: new Set(codigos),
    },
  }
}

describe('búsqueda de artículos', () => {
  const catalogo = [
    { nombre: 'ESCOBA', alias: [] },
    { nombre: 'ESCOBA CERDA DURA', alias: [] },
    { nombre: 'BOLSA NEGRA JUMBO X 10 UNIDADES', alias: ['bolsa negra grande'] },
    { nombre: 'LIMPIDO 3.8 LITROS', alias: [] },
    { nombre: 'PEQUEÑA CAJA', alias: [] },
  ]

  it('normaliza tildes, mayúsculas y signos', () => {
    expect(normalizar('  PEQUEÑA   Caja—X ')).toBe('pequena caja x')
  })

  it('tolera plurales, tildes y erratas, y prefiere el artículo más corto', () => {
    expect(buscar('escobas', catalogo)[0].articulo.nombre).toBe('ESCOBA')
    expect(buscar('pequeña', catalogo)[0].articulo.nombre).toBe('PEQUEÑA CAJA')
    expect(buscar('limpdo', catalogo)[0].articulo.nombre).toBe('LIMPIDO 3.8 LITROS')
  })

  it('encuentra por alias y no inventa coincidencias', () => {
    expect(buscar('bolsa negra grande', catalogo)[0].articulo.nombre).toBe('BOLSA NEGRA JUMBO X 10 UNIDADES')
    expect(buscar('computador portatil', catalogo)).toEqual([])
  })
})

describe('importar el export de Elisa', () => {
  it('parsea columnas fijas: nombres con doble espacio, miles y fila de total', () => {
    const filas = parsearExportElisa(EXPORT)
    expect(filas).toHaveLength(9)
    expect(filas.find((f) => f.nombre === 'TENI DAMA TALLA 41')).toMatchObject({ grupo: 'DOTACION', existencia: 0 })
    expect(filas.find((f) => f.nombre === 'PAPEL HIGIENICO CAJA').existencia).toBe(184427)
  })

  it('crea, suma duplicados y marca "NO USAR" como inactivo', async () => {
    const { actor } = await actorConPermisos(['requerimientos:gestionar_bodega'])
    const r = await importarExistencias(EXPORT, actor)
    expect(r).toMatchObject({ total: 8, creados: 8, actualizados: 0, duplicadosSumados: 1 })
    expect((await Articulo.findOne({ nombre: 'VENTILADOR AIR PRO' })).existencia).toBe(2)
    expect((await Articulo.findOne({ nombre: 'NO USAR' })).activo).toBe(false)
  })

  it('reimportar actualiza existencia sin pisar alias ni presentaciones', async () => {
    const { actor } = await actorConPermisos(['requerimientos:gestionar_bodega'])
    await importarExistencias(EXPORT, actor)
    const bolsa = await Articulo.findOne({ nombre: 'BOLSA NEGRA JUMBO X 10 UNIDADES' })
    await editarArticulo(bolsa._id, { alias: ['bolsa negra grande'], presentaciones: [{ nombre: 'paquete', factor: 10 }] }, actor)

    const r = await importarExistencias(EXPORT.replace('223  ', '99   '), actor)
    expect(r).toMatchObject({ creados: 0, actualizados: 8 })
    const despues = await Articulo.findById(bolsa._id)
    expect(despues.existencia).toBe(99)
    expect(despues.alias).toEqual(['bolsa negra grande'])
    expect(despues.presentaciones[0]).toMatchObject({ nombre: 'paquete', factor: 10 })
  })

  it('rechaza un archivo que no es el export', async () => {
    const { actor } = await actorConPermisos(['requerimientos:gestionar_bodega'])
    await expect(importarExistencias('hola', actor)).rejects.toThrow(/ningún artículo/)
  })

  it('el buscador del solicitante no expone existencias ni inactivos', async () => {
    const { actor } = await actorConPermisos(['requerimientos:gestionar_bodega'])
    await importarExistencias(EXPORT, actor)
    const r = await buscarParaSolicitante('escoba')
    expect(r[0].nombre).toBe('ESCOBA')
    expect(r[0]).not.toHaveProperty('existencia')
    expect(await buscarParaSolicitante('no usar')).toEqual([])
  })
})

describe('consolidado de despacho', () => {
  async function armarEscenario() {
    const bodega = await actorConPermisos(['requerimientos:gestionar_bodega'])
    const financiero = await actorConPermisos(['requerimientos:aprobar_financiero'], { conFirma: true })
    await importarExistencias(EXPORT, bodega.actor)
    const bolsa = await Articulo.findOne({ nombre: 'BOLSA NEGRA JUMBO X 10 UNIDADES' })
    await editarArticulo(bolsa._id, { presentaciones: [{ nombre: 'paquete', factor: 10 }] }, bodega.actor)
    const escoba = await Articulo.findOne({ nombre: 'ESCOBA' })

    const pedir = async (items) => {
      const sol = await actorConPermisos([])
      const req = await crearRequerimiento({ tipo: 'compra', dirigidoAlmacen: true, itemsCompra: items }, sol.actor)
      await aprobarComoFinanciero(req._id, { password: financiero.password }, financiero.actor)
      return req
    }
    return { bodega, financiero, bolsa, escoba, pedir }
  }
  const hoy = () => new Date()

  it('suma por artículo entre requerimientos, aplica el factor y marca faltantes', async () => {
    const { escoba, bolsa, pedir } = await armarEscenario()
    await pedir([
      { descripcionProducto: 'escoba', cantidad: 15, fechaSolicitud: hoy(), articulo: String(escoba._id) },
      { descripcionProducto: 'Bolsa negra jumbo', cantidad: 2, fechaSolicitud: hoy(), articulo: String(bolsa._id), presentacion: 'paquete' },
    ])
    await pedir([{ descripcionProducto: 'ESCOBA', cantidad: 10, fechaSolicitud: hoy() }]) // exacto: se vincula solo

    const c = await consolidadoDespacho()
    expect(c.requerimientos).toBe(2)
    const filaEscoba = c.articulos.find((a) => a.articulo.nombre === 'ESCOBA')
    expect(filaEscoba).toMatchObject({ total: 25, faltante: 5 })
    expect(filaEscoba.desglose).toHaveLength(2)
    expect(c.articulos.find((a) => a.articulo.nombre.startsWith('BOLSA NEGRA'))).toMatchObject({ total: 20, faltante: 0 })
    expect(c.sinStock).toBe(1)
    expect(c.sinIdentificar).toEqual([])
  })

  it('el factor lo fija el catálogo, no el cliente', async () => {
    const { bolsa, pedir } = await armarEscenario()
    const req = await pedir([
      { descripcionProducto: 'bolsas', cantidad: 1, fechaSolicitud: hoy(), articulo: String(bolsa._id), presentacion: 'caja gigante', factorPresentacion: 9999 },
    ])
    const doc = await (await import('../src/models/Requerimiento.js')).default.findById(req._id)
    expect(doc.itemsCompra[0]).toMatchObject({ presentacion: '', factorPresentacion: 1 })
  })

  it('texto libre queda sin identificar con sugerencias y al vincular aprende el alias', async () => {
    const { escoba, bodega, pedir } = await armarEscenario()
    const req = await pedir([{ descripcionProducto: 'escobas grandes', cantidad: 4, fechaSolicitud: hoy() }])

    let c = await consolidadoDespacho()
    expect(c.articulos).toEqual([])
    expect(c.sinIdentificar[0].texto).toBe('escobas grandes')
    expect(c.sinIdentificar[0].sugerencias[0].nombre).toBe('ESCOBA')

    const itemId = c.sinIdentificar[0].desglose[0].itemId
    await vincularItemArticulo(req._id, itemId, { articuloId: String(escoba._id) }, bodega.actor)

    c = await consolidadoDespacho()
    expect(c.sinIdentificar).toEqual([])
    expect(c.articulos[0]).toMatchObject({ total: 4 })
    expect((await Articulo.findById(escoba._id)).alias).toContain('escobas grandes')

    // La próxima vez que alguien lo escriba igual, se vincula solo.
    await pedir([{ descripcionProducto: 'Escobas Grandes', cantidad: 1, fechaSolicitud: hoy() }])
    c = await consolidadoDespacho()
    expect(c.sinIdentificar).toEqual([])
    expect(c.articulos[0].total).toBe(5)
  })

  it('un requerimiento ya despachado sale del consolidado', async () => {
    const { escoba, bodega, pedir } = await armarEscenario()
    const req = await pedir([{ descripcionProducto: 'escoba', cantidad: 1, fechaSolicitud: hoy(), articulo: String(escoba._id) }])
    const { marcarEstadoBodega } = await import('../src/modules/requerimientos/requerimientos.service.js')
    await marcarEstadoBodega(req._id, { estado: 'aprobada', password: bodega.password }, bodega.actor)
    expect((await consolidadoDespacho()).requerimientos).toBe(0)
    const ya = await consolidadoDespacho({ despachados: true })
    expect(ya.requerimientos).toBe(1)
    expect(ya.articulos[0].total).toBe(1)
  })

  it('Financiero no toca lo que ya firmó y Bodega no toca lo que Financiero no aprobó', async () => {
    const { escoba, bodega, financiero, pedir } = await armarEscenario()
    const aprobado = await pedir([{ descripcionProducto: 'algo', cantidad: 1, fechaSolicitud: hoy() }])
    const itemAprobado = (await (await import('../src/models/Requerimiento.js')).default.findById(aprobado._id)).itemsCompra[0]._id
    await expect(vincularItemArticulo(aprobado._id, itemAprobado, { articuloId: String(escoba._id) }, financiero.actor)).rejects.toThrow(/ya no se puede modificar/)

    const sol = await actorConPermisos([])
    const pendiente = await crearRequerimiento(
      { tipo: 'compra', dirigidoAlmacen: true, itemsCompra: [{ descripcionProducto: 'algo', cantidad: 1, fechaSolicitud: hoy() }] },
      sol.actor
    )
    const itemPendiente = pendiente.itemsCompra[0]._id
    await expect(vincularItemArticulo(pendiente._id, itemPendiente, { articuloId: String(escoba._id) }, bodega.actor)).rejects.toThrow(/ya no se puede modificar/)
  })

  it('supervisión incluye también lo despachado y permite filtrar por estado', async () => {
    const { escoba, bodega, pedir } = await armarEscenario()
    const despachado = await pedir([{ descripcionProducto: 'escoba', cantidad: 3, fechaSolicitud: hoy(), articulo: String(escoba._id) }])
    const { marcarEstadoBodega } = await import('../src/modules/requerimientos/requerimientos.service.js')
    await marcarEstadoBodega(despachado._id, { estado: 'aprobada', password: bodega.password }, bodega.actor)
    await pedir([{ descripcionProducto: 'escobas grandes', cantidad: 4, fechaSolicitud: hoy() }])

    expect((await consolidadoDespacho()).requerimientos).toBe(1)
    const c = await consolidadoDespacho({ supervision: true })
    expect(c.requerimientos).toBe(2)
    expect(c.articulos[0]).toMatchObject({ total: 3 })
    expect(c.articulos[0].desglose[0].estado).toBe('pendiente_bodega')
    expect(c.sinIdentificar[0].texto).toBe('escobas grandes')
    expect((await consolidadoDespacho({ supervision: true, estado: 'rechazado' })).requerimientos).toBe(0)
  })

  it('re-vincular al mismo artículo conserva la presentación', async () => {
    const { bolsa, bodega, pedir } = await armarEscenario()
    const req = await pedir([{ descripcionProducto: 'bolsas', cantidad: 2, fechaSolicitud: hoy(), articulo: String(bolsa._id), presentacion: 'paquete' }])
    const itemId = req.itemsCompra[0]._id
    await vincularItemArticulo(req._id, itemId, { articuloId: String(bolsa._id) }, bodega.actor)
    expect((await consolidadoDespacho()).articulos[0].total).toBe(20)
  })
})

describe('alias del catálogo', () => {
  it('el nombre exacto gana sobre un alias igual de otro artículo', async () => {
    const { actor } = await actorConPermisos(['requerimientos:gestionar_bodega'])
    await importarExistencias(EXPORT, actor)
    const cerda = await Articulo.findOne({ nombre: 'ESCOBA CERDA DURA' })
    await Articulo.updateOne({ _id: cerda._id }, { alias: ['escoba'], aliasNormalizados: ['escoba'] })
    const { coincidenciaExacta } = await import('../src/modules/requerimientos/articulos.busqueda.js')
    const todos = await Articulo.find({}).lean()
    expect(coincidenciaExacta('escoba', todos).nombre).toBe('ESCOBA')
  })

  it('un alias no puede ser el nombre de otro artículo y se mueve al último que lo reclama', async () => {
    const { actor } = await actorConPermisos(['requerimientos:gestionar_bodega'])
    await importarExistencias(EXPORT, actor)
    const cerda = await Articulo.findOne({ nombre: 'ESCOBA CERDA DURA' })
    const limpido = await Articulo.findOne({ nombre: 'LIMPIDO 3.8 LITROS' })
    await expect(editarArticulo(cerda._id, { alias: ['escoba'] }, actor)).rejects.toThrow(/ya es un artículo/)

    await editarArticulo(cerda._id, { alias: ['barredor'] }, actor)
    await editarArticulo(limpido._id, { alias: ['barredor'] }, actor)
    expect((await Articulo.findById(cerda._id)).alias).toEqual([])
    expect((await Articulo.findById(limpido._id)).alias).toEqual(['barredor'])
  })
})
