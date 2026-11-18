import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'

vi.mock('../../api/ausencias.js', () => ({
  ausencias: {
    mias: vi.fn(),
    crear: vi.fn(),
    cancelar: vi.fn(),
    reenviarIncapacidad: vi.fn(),
    urlSoporte: (id, archivo) => `/api/ausencias/${id}/soporte/${archivo}`,
  },
}))

import { ausencias as api } from '../../api/ausencias.js'
import { limpiarCache } from '../../hooks/useDatosConCache.js'
import MisAusenciasPage from './MisAusenciasPage.jsx'

const base = {
  tipo: 'incapacidad',
  fechaInicio: '2027-03-01T05:00:00.000Z',
  fechaFin: '2027-03-03T05:00:00.000Z',
  diasHabiles: 3,
  soporte: { archivo: '1_cert.pdf', nombreArchivo: 'cert.pdf' },
  decision: {},
  direccionamiento: {},
}

beforeEach(() => {
  limpiarCache()
  vi.clearAllMocks()
})

describe('Mis ausencias — trámite de la incapacidad', () => {
  it('le cuenta al trabajador en qué punto va cada incapacidad', async () => {
    api.mias.mockResolvedValue({
      ausencias: [
        { ...base, _id: 'a', estado: 'pendiente', etapa: 'en_verificacion' },
        { ...base, _id: 'b', estado: 'aprobada', etapa: 'foliada', decision: { nombreRevisor: 'Laura SIG' } },
        {
          ...base, _id: 'c', estado: 'aprobada', etapa: 'direccionada',
          decision: { nombreRevisor: 'Laura SIG' },
          direccionamiento: { nombreDestinatario: 'Karol Tamayo' },
        },
      ],
    })
    render(<MisAusenciasPage />)

    expect(await screen.findByText('En verificación (SIG)')).toBeInTheDocument()
    expect(screen.getByText('En trámite administrativo')).toBeInTheDocument()
    expect(screen.getByText(/En Talento Humano · dirigida a Karol Tamayo/)).toBeInTheDocument()
    expect(screen.getAllByText(/Verificada y aprobada por Laura SIG/)).toHaveLength(2)
  })

  it('cuando Talento Humano la tramita se lo dice', async () => {
    api.mias.mockResolvedValue({ ausencias: [{ ...base, _id: 't', estado: 'aprobada', etapa: 'tramitada', decision: { nombreRevisor: 'Laura SIG' } }] })
    render(<MisAusenciasPage />)
    expect(await screen.findByText('Tramitada por Talento Humano')).toBeInTheDocument()
  })

  it('una incapacidad devuelta muestra el motivo y permite corregirla y reenviarla', async () => {
    api.mias.mockResolvedValue({
      ausencias: [{
        ...base, _id: 'dev', estado: 'pendiente', etapa: 'devuelta',
        historial: [
          { accion: 'creada' },
          { accion: 'devuelta', nota: 'El certificado está cortado' },
        ],
      }],
    })
    api.reenviarIncapacidad.mockResolvedValue({})
    render(<MisAusenciasPage />)

    expect(await screen.findByText('Devuelta, necesita corrección')).toBeInTheDocument()
    expect(screen.getByText('El certificado está cortado')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Corregir/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/SIG la devolvió con este comentario/)).toBeInTheDocument()

    fireEvent.change(within(dialogo).getByLabelText(/Comentario para SIG/), { target: { value: 'Ya está completo' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: /Reenviar a verificación/ }))

    // Sin soporte nuevo ni fechas cambiadas, solo viaja el comentario.
    await waitFor(() => expect(api.reenviarIncapacidad).toHaveBeenCalledWith('dev', { comentario: 'Ya está completo' }))
    expect(await screen.findByText(/enviada de nuevo a verificación/)).toBeInTheDocument()
  })

  it('si cambia las fechas, las manda en la corrección', async () => {
    api.mias.mockResolvedValue({
      ausencias: [{ ...base, _id: 'dev', estado: 'pendiente', etapa: 'devuelta', historial: [{ accion: 'devuelta', nota: 'Fechas mal' }] }],
    })
    api.reenviarIncapacidad.mockResolvedValue({})
    render(<MisAusenciasPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Corregir/ }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.change(within(dialogo).getByLabelText('Hasta'), { target: { value: '2027-03-05' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: /Reenviar a verificación/ }))

    await waitFor(() => expect(api.reenviarIncapacidad).toHaveBeenCalledWith('dev', { comentario: '', fechaFin: '2027-03-05' }))
  })

  it('solo las devueltas tienen el botón Corregir', async () => {
    api.mias.mockResolvedValue({
      ausencias: [{ ...base, _id: 'a', estado: 'pendiente', etapa: 'en_verificacion' }],
    })
    render(<MisAusenciasPage />)
    await screen.findByText('En verificación (SIG)')
    expect(screen.queryByRole('button', { name: /Corregir/ })).not.toBeInTheDocument()
    // Retirar sigue disponible mientras no la haya aprobado SIG.
    expect(screen.getByRole('button', { name: /Retirar/ })).toBeInTheDocument()
  })

  it('vacaciones y permisos conservan su estado de siempre', async () => {
    api.mias.mockResolvedValue({
      ausencias: [{ _id: 'v', tipo: 'vacaciones', estado: 'pendiente', fechaInicio: base.fechaInicio, fechaFin: base.fechaFin, diasHabiles: 3, decision: {} }],
    })
    render(<MisAusenciasPage />)
    expect(await screen.findByText('En revisión')).toBeInTheDocument()
  })
})

describe('Mis ausencias en el celular', () => {
  it('muestra cada ausencia como tarjeta, con el estado y Corregir a la vista', async () => {
    const original = window.matchMedia
    window.matchMedia = (q) => ({ matches: q.includes('max-width'), media: q, addEventListener() {}, removeEventListener() {} })
    try {
      api.mias.mockResolvedValue({
        ausencias: [{ ...base, _id: 'dev', estado: 'pendiente', etapa: 'devuelta', historial: [{ accion: 'devuelta', nota: 'Falta la hoja 2' }] }],
      })
      render(<MisAusenciasPage />)
      expect(await screen.findByText('Devuelta, necesita corrección')).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.getByRole('listitem')).toHaveTextContent('3 días')
      expect(screen.getByRole('button', { name: /Corregir/ })).toBeInTheDocument()
    } finally {
      window.matchMedia = original
    }
  })
})
