import { describe, it, expect, vi, beforeEach } from 'vitest'
import mongoose from 'mongoose'
import Requerimiento from '../src/models/Requerimiento.js'
import ReporteDano from '../src/models/ReporteDano.js'
import Notificacion from '../src/models/Notificacion.js'
import { calcularResumen } from '../src/modules/operacion/dashboard.service.js'

vi.mock('../src/modules/sistema/sistema.service.js', () => ({ estaModuloActivo: async () => true }))

describe('calcularResumen — RBAC y Cola Prioritaria de Requerimientos', () => {
  let userId

  beforeEach(async () => {
    userId = new mongoose.Types.ObjectId()
    await Requerimiento.deleteMany({})
    await ReporteDano.deleteMany({})
    await Notificacion.deleteMany({})

    await Requerimiento.create([
      {
        tipo: 'compra',
        solicitante: userId,
        cargoSolicitante: 'Operador',
        dependencia: 'Operaciones',
        estado: 'pendiente_financiero',
        versionOriginal: {},
        items: [{ descripcionProducto: 'Laptop Dell', fechaSolicitud: new Date(), cantidad: 1 }],
      },
      {
        tipo: 'servicio',
        solicitante: userId,
        cargoSolicitante: 'Operador',
        dependencia: 'Operaciones',
        estado: 'pendiente_bodega',
        versionOriginal: {},
        items: [{ descripcionProducto: 'Mantenimiento AC', fechaSolicitud: new Date(), cantidad: 1 }],
      },
    ])
  })

  it('un administrador SIN permisos de requerimientos NO debe ver tarjetas ni cola de requerimientos', async () => {
    const usuarioAdminSinReq = {
      id_usuario: userId,
      esSuperAdmin: false,
      permisos: new Set(['usuarios:gestionar']),
      rol: { slug: 'administrador', nombre: 'Administrador' },
    }

    const resumen = await calcularResumen(usuarioAdminSinReq)

    expect(resumen.tarjetas.requerimientosPendientes).toBeUndefined()
    expect(resumen.tarjetas.requerimientosPorDespachar).toBeUndefined()
    const reqEnCola = resumen.colaPrioritaria.filter((item) => item.modulo === 'Requerimientos')
    expect(reqEnCola).toHaveLength(0)
    const recomReq = resumen.recomendaciones.filter((r) => r.id.startsWith('req-'))
    expect(recomReq).toHaveLength(0)
  })

  it('un usuario con solo requerimientos:aprobar_financiero solo ve pendiente_financiero con ruta a /requerimientos/financiero', async () => {
    const usuarioFinanciero = {
      id_usuario: userId,
      esSuperAdmin: false,
      permisos: new Set(['requerimientos:aprobar_financiero']),
      rol: { slug: 'financiero', nombre: 'Financiero' },
    }

    const resumen = await calcularResumen(usuarioFinanciero)

    expect(resumen.tarjetas.requerimientosPendientes).toBe(1)
    expect(resumen.tarjetas.requerimientosPorDespachar).toBeUndefined()
    const reqEnCola = resumen.colaPrioritaria.filter((item) => item.modulo === 'Requerimientos')
    expect(reqEnCola).toHaveLength(1)
    expect(reqEnCola[0].estado).toBe('pendiente_financiero')
    expect(reqEnCola[0].to).toBe('/requerimientos/financiero')
  })

  it('un usuario con solo requerimientos:gestionar_bodega solo ve pendiente_bodega con ruta a /requerimientos/bodega', async () => {
    const usuarioBodega = {
      id_usuario: userId,
      esSuperAdmin: false,
      permisos: new Set(['requerimientos:gestionar_bodega']),
      rol: { slug: 'bodega', nombre: 'Bodega' },
    }

    const resumen = await calcularResumen(usuarioBodega)

    expect(resumen.tarjetas.requerimientosPendientes).toBeUndefined()
    expect(resumen.tarjetas.requerimientosPorDespachar).toBe(1)
    const reqEnCola = resumen.colaPrioritaria.filter((item) => item.modulo === 'Requerimientos')
    expect(reqEnCola).toHaveLength(1)
    expect(reqEnCola[0].estado).toBe('pendiente_bodega')
    expect(reqEnCola[0].to).toBe('/requerimientos/bodega')
  })

  it('un Super Admin ve ambos estados y con sus respectivas rutas de atención', async () => {
    const usuarioSuperAdmin = {
      id_usuario: userId,
      esSuperAdmin: true,
      permisos: new Set(),
      rol: { slug: 'super_admin', nombre: 'Super Admin' },
    }

    const resumen = await calcularResumen(usuarioSuperAdmin)

    expect(resumen.tarjetas.requerimientosPendientes).toBe(2)
    expect(resumen.tarjetas.requerimientosPorDespachar).toBe(1)
    const reqEnCola = resumen.colaPrioritaria.filter((item) => item.modulo === 'Requerimientos')
    expect(reqEnCola).toHaveLength(2)
  })
})
