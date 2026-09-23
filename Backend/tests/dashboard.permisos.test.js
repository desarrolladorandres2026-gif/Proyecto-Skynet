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

  it('un administrador SIN permisos de requerimientos NO debe ver tarjetas de requerimientos', async () => {
    const usuarioAdminSinReq = {
      id_usuario: userId,
      esSuperAdmin: false,
      permisos: new Set(['usuarios:gestionar']),
      rol: { slug: 'administrador', nombre: 'Administrador' },
    }

    const resumen = await calcularResumen(usuarioAdminSinReq)

    expect(resumen.tarjetas.requerimientosPendientes).toBeUndefined()
    expect(resumen.tarjetas.requerimientosPorDespachar).toBeUndefined()
  })

  it('un usuario con solo requerimientos:aprobar_financiero solo ve la tarjeta de pendiente_financiero', async () => {
    const usuarioFinanciero = {
      id_usuario: userId,
      esSuperAdmin: false,
      permisos: new Set(['requerimientos:aprobar_financiero']),
      rol: { slug: 'financiero', nombre: 'Financiero' },
    }

    const resumen = await calcularResumen(usuarioFinanciero)

    expect(resumen.tarjetas.requerimientosPendientes).toBe(1)
    expect(resumen.tarjetas.requerimientosPorDespachar).toBeUndefined()
  })

  it('un usuario con solo requerimientos:gestionar_bodega solo ve la tarjeta de pendiente_bodega', async () => {
    const usuarioBodega = {
      id_usuario: userId,
      esSuperAdmin: false,
      permisos: new Set(['requerimientos:gestionar_bodega']),
      rol: { slug: 'bodega', nombre: 'Bodega' },
    }

    const resumen = await calcularResumen(usuarioBodega)

    expect(resumen.tarjetas.requerimientosPendientes).toBeUndefined()
    expect(resumen.tarjetas.requerimientosPorDespachar).toBe(1)
  })

  it('un Super Admin ve ambos estados', async () => {
    const usuarioSuperAdmin = {
      id_usuario: userId,
      esSuperAdmin: true,
      permisos: new Set(),
      rol: { slug: 'super_admin', nombre: 'Super Admin' },
    }

    const resumen = await calcularResumen(usuarioSuperAdmin)

    expect(resumen.tarjetas.requerimientosPendientes).toBe(2)
    expect(resumen.tarjetas.requerimientosPorDespachar).toBe(1)
  })
})
