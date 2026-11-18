import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react'

vi.mock('../../api/ausencias.js', () => ({
  ausencias: {
    tramiteIncapacidades: vi.fn(),
    supervisionIncapacidades: vi.fn(),
    destinatariosIncapacidades: vi.fn(),
    verificarIncapacidad: vi.fn(),
    devolverIncapacidad: vi.fn(),
    foliarIncapacidad: vi.fn(),
    direccionarIncapacidad: vi.fn(),
    completarFolioIncapacidad: vi.fn(),
    tramitarIncapacidad: vi.fn(),
    urlSoporte: (id, archivo) => `/api/ausencias/${id}/soporte/${archivo}`,
  },
}))

import { ausencias as api } from '../../api/ausencias.js'
import { limpiarCache } from '../../hooks/useDatosConCache.js'
import TramiteIncapacidadesPage from './TramiteIncapacidadesPage.jsx'
import SupervisionIncapacidadesPage from './SupervisionIncapacidadesPage.jsx'

const incapacidad = (extra = {}) => ({
  _id: 'inc1',
  tipo: 'incapacidad',
  estado: 'pendiente',
  etapa: 'en_verificacion',
  etapaEfectiva: 'en_verificacion',
  diasEnEtapa: 2,
  fechaInicio: '2027-03-01T05:00:00.000Z',
  fechaFin: '2027-03-03T05:00:00.000Z',
  diasHabiles: 3,
  motivo: 'Reposo',
  cargoSolicitante: 'Operador',
  solicitante: { _id: 'u1', nombre: 'Ana Pérez', cargo: 'Operador' },
  soporte: { archivo: '1_cert.pdf', nombreArchivo: 'cert.pdf' },
  historial: [{ accion: 'creada', nombre: 'Ana Pérez', cargo: 'Operador', fecha: '2027-02-28T15:00:00.000Z' }],
  folio: {},
  direccionamiento: {},
  ...extra,
})

beforeEach(() => {
  limpiarCache()
  vi.clearAllMocks()
})

describe('TramiteIncapacidadesPage', () => {
  it('muestra solo las pestañas del paso que le toca a quien consulta', async () => {
    api.tramiteIncapacidades.mockResolvedValue({ porVerificar: [incapacidad()] })
    render(<TramiteIncapacidadesPage />)

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Por verificar/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Por foliar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Por direccionar/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver soporte/ })).toHaveAttribute('href', '/api/ausencias/inc1/soporte/1_cert.pdf')
  })

  it('sin ningún paso asignado lo dice', async () => {
    api.tramiteIncapacidades.mockResolvedValue({})
    render(<TramiteIncapacidadesPage />)
    expect(await screen.findByText(/No tienes pasos del trámite/)).toBeInTheDocument()
  })

  it('SIG verifica y aprueba con una observación', async () => {
    api.tramiteIncapacidades.mockResolvedValue({ porVerificar: [incapacidad()] })
    api.verificarIncapacidad.mockResolvedValue({})
    render(<TramiteIncapacidadesPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Verificar y aprobar/ }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.change(within(dialogo).getByRole('textbox'), { target: { value: 'Todo completo' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: /Verificar y aprobar/ }))

    await waitFor(() => expect(api.verificarIncapacidad).toHaveBeenCalledWith('inc1', 'Todo completo'))
    expect(await screen.findByText(/verificada y aprobada/i)).toBeInTheDocument()
  })

  it('SIG devuelve con el motivo de lo que falta', async () => {
    api.tramiteIncapacidades.mockResolvedValue({ porVerificar: [incapacidad()] })
    api.devolverIncapacidad.mockResolvedValue({})
    render(<TramiteIncapacidadesPage />)

    fireEvent.click(await screen.findByRole('button', { name: /^Devolver/ }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.change(within(dialogo).getByRole('textbox'), { target: { value: 'Falta la hoja 2' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: /^Devolver$/ }))

    await waitFor(() => expect(api.devolverIncapacidad).toHaveBeenCalledWith('inc1', 'Falta la hoja 2'))
  })

  it('la Secretaria folía con el número de folio', async () => {
    api.tramiteIncapacidades.mockResolvedValue({
      porFoliar: [incapacidad({ estado: 'aprobada', etapa: 'por_foliar' })],
      porCompletarFolio: [],
    })
    api.foliarIncapacidad.mockResolvedValue({})
    render(<TramiteIncapacidadesPage />)

    fireEvent.click(await screen.findByRole('button', { name: /^Foliar$/ }))
    const dialogo = await screen.findByRole('dialog')
    const [numero] = within(dialogo).getAllByRole('textbox')
    fireEvent.change(numero, { target: { value: '0457' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: /^Foliar$/ }))

    await waitFor(() => expect(api.foliarIncapacidad).toHaveBeenCalledWith('inc1', { numeroFolio: '0457', observacion: '' }))
  })

  it('la Gerencia direcciona a una persona de Talento Humano con un mensaje', async () => {
    api.tramiteIncapacidades.mockResolvedValue({
      porDireccionar: [incapacidad({ estado: 'aprobada', etapa: 'foliada', folio: { numero: '0457' } })],
    })
    api.destinatariosIncapacidades.mockResolvedValue({
      destinatarios: [{ _id: 'th1', nombre: 'Karol Tamayo', cargo: 'Auxiliar Admtva y G.H' }],
    })
    api.direccionarIncapacidad.mockResolvedValue({})
    render(<TramiteIncapacidadesPage />)

    expect(await screen.findByText(/Folio/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Direccionar$/ }))
    const dialogo = await screen.findByRole('dialog')
    const lista = await within(dialogo).findByRole('combobox')
    await within(dialogo).findByRole('option', { name: /Karol Tamayo/ })
    fireEvent.change(lista, { target: { value: 'th1' } })
    fireEvent.change(within(dialogo).getByRole('textbox'), { target: { value: 'Para nómina' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: /^Direccionar$/ }))

    await waitFor(() => expect(api.direccionarIncapacidad).toHaveBeenCalledWith('inc1', { destinatarioId: 'th1', mensaje: 'Para nómina' }))
  })

  it('avisa cuando nadie puede recibir incapacidades y no deja direccionar', async () => {
    api.tramiteIncapacidades.mockResolvedValue({
      porDireccionar: [incapacidad({ estado: 'aprobada', etapa: 'foliada' })],
    })
    api.destinatariosIncapacidades.mockResolvedValue({ destinatarios: [] })
    render(<TramiteIncapacidadesPage />)

    fireEvent.click(await screen.findByRole('button', { name: /^Direccionar$/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(await within(dialogo).findByText(/Nadie tiene el permiso de recibir/)).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: /^Direccionar$/ })).toBeDisabled()
  })

  it('Talento Humano ve marcadas las que van dirigidas a su nombre', async () => {
    api.tramiteIncapacidades.mockResolvedValue({
      recibidas: [incapacidad({
        estado: 'aprobada',
        etapa: 'direccionada',
        paraMi: true,
        folio: { numero: '0457' },
        direccionamiento: { nombreDestinatario: 'Karol Tamayo', mensaje: 'Para nómina' },
      })],
    })
    render(<TramiteIncapacidadesPage />)

    expect(await screen.findByText('Para ti')).toBeInTheDocument()
    expect(screen.getByText(/Karol Tamayo/)).toBeInTheDocument()
    // Talento Humano no foliá, direcciona ni devuelve: solo recibe y tramita.
    expect(screen.queryByRole('button', { name: /^(Foliar|Direccionar|Devolver)$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Marcar tramitada/ })).toBeInTheDocument()
  })

  it('Talento Humano marca la incapacidad como tramitada, y las ya tramitadas no repiten el botón', async () => {
    const dirigida = incapacidad({
      estado: 'aprobada', etapa: 'direccionada', paraMi: true,
      direccionamiento: { nombreDestinatario: 'Karol Tamayo' },
    })
    const cerrada = incapacidad({ _id: 'inc9', estado: 'aprobada', etapa: 'tramitada', solicitante: { _id: 'u9', nombre: 'Rosa Díaz' } })
    api.tramiteIncapacidades.mockResolvedValue({ recibidas: [dirigida, cerrada] })
    api.tramitarIncapacidad.mockResolvedValue({})
    render(<TramiteIncapacidadesPage />)

    await screen.findByText('Rosa Díaz')
    expect(screen.getAllByRole('button', { name: /Marcar tramitada/ })).toHaveLength(1)
    expect(screen.getByText('Tramitada')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Marcar tramitada/ }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.change(within(dialogo).getByRole('textbox'), { target: { value: 'Radicada ante la EPS' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: /Marcar tramitada/ }))
    await waitFor(() => expect(api.tramitarIncapacidad).toHaveBeenCalledWith('inc1', 'Radicada ante la EPS'))
  })

  it('el número de folio es opcional', async () => {
    api.tramiteIncapacidades.mockResolvedValue({ porFoliar: [incapacidad({ estado: 'aprobada', etapa: 'por_foliar' })] })
    api.foliarIncapacidad.mockResolvedValue({})
    render(<TramiteIncapacidadesPage />)

    fireEvent.click(await screen.findByRole('button', { name: /^Foliar$/ }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByLabelText('Número de folio (opcional)')).not.toBeRequired()
    fireEvent.click(within(dialogo).getByRole('button', { name: /^Foliar$/ }))
    await waitFor(() => expect(api.foliarIncapacidad).toHaveBeenCalledWith('inc1', { numeroFolio: '', observacion: '' }))
  })

  it('muestra el error del servidor dentro del formulario', async () => {
    api.tramiteIncapacidades.mockResolvedValue({ porVerificar: [incapacidad()] })
    api.verificarIncapacidad.mockRejectedValue(new Error('No puedes verificar tu propia incapacidad'))
    render(<TramiteIncapacidadesPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Verificar y aprobar/ }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.click(within(dialogo).getByRole('button', { name: /Verificar y aprobar/ }))

    expect(await within(dialogo).findByText(/tu propia incapacidad/)).toBeInTheDocument()
  })
})

describe('SupervisionIncapacidadesPage', () => {
  const respuesta = {
    incapacidades: [
      incapacidad(),
      incapacidad({
        _id: 'inc2',
        estado: 'aprobada',
        etapa: 'direccionada',
        etapaEfectiva: 'direccionada',
        diasEnEtapa: 5,
        solicitante: { _id: 'u2', nombre: 'Luis Gómez' },
        folio: { numero: 'F-77', destinatarioRegistrado: false },
        direccionamiento: { nombreDestinatario: 'Karol Tamayo', mensaje: 'Para nómina' },
        historial: [
          { accion: 'creada', nombre: 'Luis Gómez', fecha: '2027-02-20T15:00:00.000Z' },
          { accion: 'verificada', nombre: 'Laura SIG', cargo: 'SIG', fecha: '2027-02-21T15:00:00.000Z', nota: 'Completo' },
          { accion: 'direccionada', nombre: 'Gerente', fecha: '2027-02-24T15:00:00.000Z', nota: 'Dirigida a Karol Tamayo' },
        ],
      }),
    ],
    resumen: { total: 2, canceladas: 0, sin_tramite: 0, en_verificacion: 1, direccionada: 1 },
  }

  it('lista todas con su etapa, los conteos y el tiempo detenidas', async () => {
    api.supervisionIncapacidades.mockResolvedValue(respuesta)
    render(<SupervisionIncapacidadesPage />)

    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument()
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument()
    expect(screen.getByText('F-77')).toBeInTheDocument()
    expect(screen.getByText('Falta anotar destinatario')).toBeInTheDocument()
    // Conteos en los filtros por etapa.
    expect(screen.getByRole('button', { name: /^Todas\s*2/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /En Talento Humano\s*1/ })).toBeInTheDocument()
    expect(screen.getByText('5 d')).toBeInTheDocument()
  })

  it('filtrar por etapa pide solo esa etapa al servidor', async () => {
    api.supervisionIncapacidades.mockResolvedValue(respuesta)
    render(<SupervisionIncapacidadesPage />)
    await screen.findByText('Ana Pérez')

    fireEvent.click(screen.getByRole('button', { name: /^En verificación/ }))
    await waitFor(() => expect(api.supervisionIncapacidades).toHaveBeenLastCalledWith(expect.objectContaining({ etapa: 'en_verificacion' })))
  })

  it('el detalle cuenta el recorrido completo del trámite', async () => {
    api.supervisionIncapacidades.mockResolvedValue(respuesta)
    render(<SupervisionIncapacidadesPage />)
    await screen.findByText('Luis Gómez')

    fireEvent.click(screen.getAllByRole('button', { name: /Ver$/ })[1])
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Verificó y aprobó el soporte')).toBeInTheDocument()
    expect(within(dialogo).getByText('Direccionó a Talento Humano')).toBeInTheDocument()
    expect(within(dialogo).getByText('Pendiente de registrar')).toBeInTheDocument()
    expect(within(dialogo).getByText('Para nómina')).toBeInTheDocument()
  })

  it('sin resultados lo dice', async () => {
    api.supervisionIncapacidades.mockResolvedValue({ incapacidades: [], resumen: { total: 0, canceladas: 0, sin_tramite: 0 } })
    render(<SupervisionIncapacidadesPage />)
    expect(await screen.findByText(/No hay incapacidades con esos filtros/)).toBeInTheDocument()
  })
})

describe('Indicador de pasos', () => {
  it('marca los pasos ya hechos y en cuál va la incapacidad', async () => {
    api.supervisionIncapacidades.mockResolvedValue({
      incapacidades: [incapacidad({ estado: 'aprobada', etapa: 'foliada', etapaEfectiva: 'foliada' })],
      resumen: { total: 1, canceladas: 0, sin_tramite: 0, foliada: 1 },
    })
    render(<SupervisionIncapacidadesPage />)
    fireEvent.click(await screen.findByRole('button', { name: /Ver$/ }))
    const dialogo = await screen.findByRole('dialog')
    const pasos = within(dialogo).getByRole('list', { name: 'Pasos del trámite' })
    const items = within(pasos).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    // Va en "Gerencia direcciona": ese es el paso actual.
    expect(items[2]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).not.toHaveAttribute('aria-current')
  })
})
