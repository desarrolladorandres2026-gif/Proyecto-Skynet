import { describe, it, expect } from 'vitest'
import Rol from '../src/models/Rol.js'
import Permiso from '../src/models/Permiso.js'
import ModuloSistema from '../src/models/ModuloSistema.js'
import { PERMISOS } from '../src/seedData/rbac.data.js'
import { sincronizarCatalogoSistema, permisosObsoletos } from '../src/modules/sistema/sistema.service.js'

// Regresión de BUG-001 (auditoría 2026-08-13). El arranque BORRABA de la base
// todo permiso que ya no estuviera en rbac.data.js, y antes lo quitaba de
// todos los roles con $pull. La operación era asimétrica: agregar un permiso
// usa $setOnInsert y nunca lo asigna a un rol existente, así que un permiso
// podía salir solo de un rol pero jamás volver solo.
//
// El caso real que lo rompe es un rollback de código: al arrancar el commit
// anterior, un permiso agregado después desaparecía de todos los roles, y al
// volver adelante el permiso se recreaba pero ningún rol lo recuperaba.
// Estas pruebas fijan el comportamiento nuevo: el arranque solo reporta.

async function crearRolCon(permisoIds) {
  const sufijo = Math.random().toString(36).slice(2)
  return Rol.create({
    nombre: `Rol-${sufijo}`,
    slug: `rol-${sufijo}`,
    ambito: 'global',
    permisos: permisoIds,
  })
}

describe('Sincronización del catálogo del sistema', () => {
  it('crea los permisos declarados en código que falten en la base', async () => {
    expect(await Permiso.countDocuments()).toBe(0)

    await sincronizarCatalogoSistema()

    expect(await Permiso.countDocuments()).toBe(PERMISOS.length)
    expect(await Permiso.exists({ codigo: 'catalogos:gestionar' })).toBeTruthy()
  })

  it('no vuelve a crear ni pisa un permiso que ya existe', async () => {
    await sincronizarCatalogoSistema()
    // Un nombre editado a mano no debe revertirse en el siguiente arranque.
    await Permiso.updateOne({ codigo: 'catalogos:gestionar' }, { $set: { nombre: 'Editado a mano' } })

    await sincronizarCatalogoSistema()

    const permiso = await Permiso.findOne({ codigo: 'catalogos:gestionar' })
    expect(permiso.nombre).toBe('Editado a mano')
    expect(await Permiso.countDocuments()).toBe(PERMISOS.length)
  })

  it('NO borra un permiso obsoleto ni lo quita de los roles que lo tienen', async () => {
    // Simula el estado tras un rollback: en la base hay un permiso que el
    // código actual ya no declara, y un rol lo tiene asignado.
    const obsoleto = await Permiso.create({
      codigo: 'modulo_retirado:gestionar',
      modulo: 'modulo_retirado',
      accion: 'gestionar',
      nombre: 'Permiso de un módulo que ya no está en el código',
    })
    const rol = await crearRolCon([obsoleto._id])

    await sincronizarCatalogoSistema()

    expect(await Permiso.findById(obsoleto._id)).not.toBeNull()
    const rolRecargado = await Rol.findById(rol._id)
    expect(rolRecargado.permisos.map(String)).toContain(String(obsoleto._id))
  })

  it('reporta los permisos obsoletos para que el script pueda limpiarlos', async () => {
    await Permiso.create({
      codigo: 'modulo_retirado:gestionar',
      modulo: 'modulo_retirado',
      accion: 'gestionar',
      nombre: 'Obsoleto',
    })
    await sincronizarCatalogoSistema()

    const obsoletos = await permisosObsoletos()
    expect(obsoletos.map((p) => p.codigo)).toEqual(['modulo_retirado:gestionar'])
  })

  it('permisosObsoletos() no señala ningún permiso vigente', async () => {
    await sincronizarCatalogoSistema()
    expect(await permisosObsoletos()).toEqual([])
  })

  it('conserva el interruptor activo/inactivo de un módulo entre arranques', async () => {
    await sincronizarCatalogoSistema()
    await ModuloSistema.updateOne({ key: 'danos' }, { $set: { activo: false } })

    await sincronizarCatalogoSistema()

    const modulo = await ModuloSistema.findOne({ key: 'danos' })
    expect(modulo.activo).toBe(false)
  })
})
