import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

// Cada rol, con solo los permisos que le corresponden, tiene que ver en el menú
// de Vacaciones lo suyo y nada más. Se usa la lógica real del menú
// (useModulosVisibles) y el registro real de módulos.
let usuarioActual
vi.mock('../../auth/AuthContext.jsx', () => ({
  useAuth: () => ({
    usuario: usuarioActual,
    tienePermiso: (c) => usuarioActual.esSuperAdmin || usuarioActual.permisos.includes(c),
    tieneModulo: () => true,
    moduloActivo: () => true,
  }),
  usaPanelDenso: () => true,
}))

import { useModulosVisibles } from '../../layout/AppLayout.jsx'

function menuDeVacaciones(permisos, extra = {}) {
  usuarioActual = { esSuperAdmin: false, permisos, ...extra }
  const { result } = renderHook(() => useModulosVisibles())
  const modulo = result.current.find((m) => m.key === 'ausencias')
  return modulo ? modulo.items.map((i) => i.label) : []
}

const BASE = ['Mis ausencias']

describe('Menú de Vacaciones según el rol', () => {
  it('el trabajador sin permisos especiales solo ve sus ausencias', () => {
    expect(menuDeVacaciones([])).toEqual(BASE)
  })

  it('SIG ve el trámite (para verificar) y no la supervisión salvo que la tenga', () => {
    expect(menuDeVacaciones(['ausencias:verificar_incapacidades'])).toEqual([...BASE, 'Trámite de incapacidades'])
  })

  it('la Secretaria ve el trámite (para foliar)', () => {
    expect(menuDeVacaciones(['ausencias:foliar_incapacidades'])).toEqual([...BASE, 'Trámite de incapacidades'])
  })

  it('la Gerencia ve el trámite (para direccionar)', () => {
    expect(menuDeVacaciones(['ausencias:direccionar_incapacidades'])).toEqual([...BASE, 'Trámite de incapacidades'])
  })

  it('Talento Humano ve el trámite (para recibir) y su bandeja y calendario de vacaciones', () => {
    expect(menuDeVacaciones(['ausencias:aprobar', 'ausencias:ver_todas', 'ausencias:recibir_incapacidades'])).toEqual([
      ...BASE, 'Por decidir', 'Calendario', 'Trámite de incapacidades',
    ])
  })

  it('quien solo supervisa ve la supervisión, sin bandejas de acción', () => {
    expect(menuDeVacaciones(['ausencias:supervisar_incapacidades'])).toEqual([...BASE, 'Supervisión de incapacidades'])
  })

  it('quien tiene un paso y además supervisa ve las dos entradas', () => {
    expect(menuDeVacaciones(['ausencias:verificar_incapacidades', 'ausencias:supervisar_incapacidades'])).toEqual([
      ...BASE, 'Trámite de incapacidades', 'Supervisión de incapacidades',
    ])
  })

  it('el Super Administrador lo ve todo', () => {
    expect(menuDeVacaciones([], { esSuperAdmin: true })).toEqual([
      ...BASE, 'Por decidir', 'Calendario', 'Trámite de incapacidades', 'Supervisión de incapacidades',
    ])
  })

  it('las dos entradas nuevas no se marcan a la vez en el menú', async () => {
    const { MODULOS_REGISTRO } = await import('../../config/modulosRegistry.js')
    const items = MODULOS_REGISTRO.find((m) => m.key === 'ausencias').items
    // La del trámite es exacta: si no, /ausencias/incapacidades/supervision
    // también la resaltaría por coincidir como prefijo.
    expect(items.find((i) => i.to === '/ausencias/incapacidades').end).toBe(true)
  })
})
