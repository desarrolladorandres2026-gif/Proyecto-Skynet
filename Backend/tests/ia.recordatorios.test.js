import { describe, expect, it } from 'vitest'
import { armarRecordatorio, haPasadoElIntervalo, INTERVALO_MS } from '../src/modules/ia/ia.recordatorios.js'
import { resumenTablero } from '../src/modules/copiloto/copiloto.respuestas.js'

const destino = (clave, ruta, titulo) => ({ clave, ruta, titulo })

const DESTINOS = [
  destino('requerimientos_financiero', '/requerimientos/financiero', 'Bandeja de Financiero'),
  destino('requerimientos_bodega', '/requerimientos/bodega', 'Bandeja de Bodega'),
  destino('ausencias_bandeja', '/ausencias/bandeja', 'Ausencias por decidir'),
  destino('danos_mis_tareas', '/danos/mis-tareas', 'Mis tareas asignadas'),
]

describe('armarRecordatorio', () => {
  it('devuelve null cuando no hay trabajo accionable', () => {
    expect(armarRecordatorio({ tarjetas: { requerimientosPendientes: 0 }, destinos: DESTINOS })).toBeNull()
    expect(armarRecordatorio({ tarjetas: {}, destinos: DESTINOS })).toBeNull()
  })

  it('ignora tarjetas que son estado y no tarea', () => {
    const tarjetas = { misDanosReportados: 4, notificaciones: 9, usuarios: 90 }
    expect(armarRecordatorio({ tarjetas, destinos: DESTINOS })).toBeNull()
  })

  it('dice la cifra, saluda por el primer nombre y ofrece el botón correcto', () => {
    const r = armarRecordatorio({
      tarjetas: { requerimientosPendientes: 3 },
      destinos: DESTINOS,
      nombre: 'Laura Gómez',
    })
    expect(r.texto).toBe('Recordatorio, Laura. Tienes 3 requerimientos por aprobar.')
    expect(r.acciones).toEqual([{ etiqueta: 'Bandeja de Financiero', ruta: '/requerimientos/financiero' }])
  })

  it('combina varias pendientes y un botón por cada pantalla distinta', () => {
    const r = armarRecordatorio({
      tarjetas: { requerimientosPendientes: 1, ausenciasPendientes: 2 },
      destinos: DESTINOS,
    })
    expect(r.texto).toContain('1 requerimiento por aprobar')
    expect(r.texto).toContain('2 solicitudes de ausencia por revisar')
    expect(r.acciones.map((a) => a.ruta)).toEqual(['/requerimientos/financiero', '/ausencias/bandeja'])
  })

  it('no ofrece un botón a una pantalla que el usuario no puede abrir', () => {
    const sinBodega = DESTINOS.filter((d) => d.clave !== 'requerimientos_bodega')
    const r = armarRecordatorio({ tarjetas: { requerimientosPorDespachar: 2 }, destinos: sinBodega })
    expect(r.texto).toContain('2 requerimientos por despachar')
    expect(r.acciones).toEqual([])
  })

  it('cae al destino alterno cuando el principal no está disponible', () => {
    const destinos = [destino('requerimientos_todos', '/requerimientos/todos', 'Todos los requerimientos')]
    const r = armarRecordatorio({ tarjetas: { requerimientosPendientes: 5 }, destinos })
    expect(r.acciones).toEqual([{ etiqueta: 'Todos los requerimientos', ruta: '/requerimientos/todos' }])
  })

  it('limita los botones a tres', () => {
    const destinos = [
      destino('requerimientos_financiero', '/a', 'A'),
      destino('requerimientos_bodega', '/b', 'B'),
      destino('ausencias_bandeja', '/c', 'C'),
      destino('danos_tareas', '/d', 'D'),
    ]
    const r = armarRecordatorio({
      tarjetas: { requerimientosPendientes: 1, requerimientosPorDespachar: 1, ausenciasPendientes: 1, danosPendientes: 1 },
      destinos,
    })
    expect(r.acciones).toHaveLength(3)
  })

  it('cuenta las tareas de mantenimiento asignadas (antes se ignoraban)', () => {
    const r = armarRecordatorio({ tarjetas: { misTareasMantenimiento: 2 }, destinos: DESTINOS })
    expect(r.texto).toContain('2 tareas de mantenimiento asignadas')
    expect(r.acciones[0].ruta).toBe('/danos/mis-tareas')
  })
})

describe('resumenTablero', () => {
  it('ya no dice "todo al día" a un técnico con tareas asignadas', () => {
    expect(resumenTablero({ misTareasMantenimiento: 1 })).toBe('Tienes 1 tarea de mantenimiento asignada.')
  })
})

describe('haPasadoElIntervalo', () => {
  const ahora = new Date('2026-10-13T15:00:00Z')

  it('toca la primera vez', () => {
    expect(haPasadoElIntervalo(null, ahora)).toBe(true)
    expect(haPasadoElIntervalo(undefined, ahora)).toBe(true)
  })

  it('no toca antes de cumplirse el intervalo', () => {
    const hace1h = new Date(ahora.getTime() - 60 * 60 * 1000)
    expect(haPasadoElIntervalo(hace1h, ahora)).toBe(false)
  })

  it('toca exactamente al cumplirse el intervalo', () => {
    expect(haPasadoElIntervalo(new Date(ahora.getTime() - INTERVALO_MS), ahora)).toBe(true)
  })
})
