import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VideoDestacado from '../src/components/videos/VideoDestacado.jsx'
import VideosPage from '../src/modules/videos/VideosPage.jsx'
import { limpiarCache } from '../src/hooks/useDatosConCache.js'
import { videosApi } from '../src/api/videos.js'

// Se conserva urlArchivoVideo real (arma la URL del archivo subido); solo se
// simulan las llamadas de red.
vi.mock('../src/api/videos.js', async (importOriginal) => ({
  ...(await importOriginal()),
  videosApi: { destacado: vi.fn(), categorias: vi.fn(), listar: vi.fn() },
}))

const VIDEO = {
  id: 'v1',
  titulo: 'Protocolo de evacuación',
  descripcion: 'Qué hacer ante un simulacro.',
  categoria: 'COPASST',
  proveedor: 'youtube',
  url: 'https://youtu.be/dQw4w9WgXcQ',
  embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1',
  miniaturaUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
  fechaPublicacion: '2026-09-20T15:00:00.000Z',
  esNuevo: true,
}

function renderConRouter(ui) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

beforeEach(() => {
  vi.clearAllMocks()
  limpiarCache()
})

describe('VideoDestacado (inicio)', () => {
  it('no pinta nada si no hay videos publicados', async () => {
    videosApi.destacado.mockResolvedValue({ video: null })
    const { container } = renderConRouter(<VideoDestacado />)
    await waitFor(() => expect(videosApi.destacado).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('tampoco rompe ni pinta nada si la consulta falla (p. ej. módulo desactivado)', async () => {
    videosApi.destacado.mockRejectedValue(new Error('El módulo "Videos informativos" está desactivado'))
    const { container } = renderConRouter(<VideoDestacado />)
    await waitFor(() => expect(videosApi.destacado).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra miniatura, título, descripción, categoría, fecha y la marca "Nuevo video"', async () => {
    videosApi.destacado.mockResolvedValue({ video: VIDEO })
    renderConRouter(<VideoDestacado />)

    expect(await screen.findByRole('heading', { name: 'Protocolo de evacuación' })).toBeInTheDocument()
    expect(screen.getByText('Qué hacer ante un simulacro.')).toBeInTheDocument()
    expect(screen.getByText(/COPASST/)).toBeInTheDocument()
    expect(screen.getByText('Nuevo video')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reproducir video: Protocolo de evacuación/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver todos los videos/ })).toHaveAttribute('href', '/videos')
  })

  it('sin la marca "Nuevo video" cuando el video ya no es reciente', async () => {
    videosApi.destacado.mockResolvedValue({ video: { ...VIDEO, esNuevo: false } })
    renderConRouter(<VideoDestacado />)
    await screen.findByRole('heading', { name: 'Protocolo de evacuación' })
    expect(screen.queryByText('Nuevo video')).not.toBeInTheDocument()
  })

  it('al hacer clic abre el reproductor dentro de Skynet (iframe del embed con autoplay) y al cerrar lo desmonta', async () => {
    videosApi.destacado.mockResolvedValue({ video: VIDEO })
    renderConRouter(<VideoDestacado />)

    fireEvent.click(await screen.findByRole('button', { name: 'Ver video' }))

    const dialogo = await screen.findByRole('dialog')
    const iframe = dialogo.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe.getAttribute('src')).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(iframe.getAttribute('src')).toContain('autoplay=1')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('un enlace externo (no incrustable) ofrece abrirlo en pestaña nueva en vez de un iframe', async () => {
    videosApi.destacado.mockResolvedValue({ video: { ...VIDEO, proveedor: 'externo', embedUrl: null, url: 'https://intranet.ejemplo.com/capacitacion' } })
    renderConRouter(<VideoDestacado />)

    fireEvent.click(await screen.findByRole('button', { name: 'Ver video' }))

    const dialogo = await screen.findByRole('dialog')
    expect(dialogo.querySelector('iframe')).toBeNull()
    const enlace = screen.getByRole('link', { name: /Abrir video en una pestaña nueva/ })
    expect(enlace).toHaveAttribute('href', 'https://intranet.ejemplo.com/capacitacion')
    expect(enlace).toHaveAttribute('target', '_blank')
    expect(enlace.getAttribute('rel')).toContain('noopener')
  })
})

describe('VideosPage (historial)', () => {
  const PAGINA = {
    videos: [VIDEO, { ...VIDEO, id: 'v2', titulo: 'Inducción SIG', categoria: 'Comité SIG', esNuevo: false }],
    total: 2,
    page: 1,
    pages: 1,
  }

  beforeEach(() => {
    videosApi.categorias.mockResolvedValue({ categorias: ['COPASST', 'Comité SIG'] })
    videosApi.listar.mockResolvedValue(PAGINA)
  })

  it('lista los videos y ofrece filtrar por categoría', async () => {
    renderConRouter(<VideosPage />)

    expect(await screen.findByRole('heading', { name: 'Protocolo de evacuación' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Inducción SIG' })).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Comité SIG' }))
    await waitFor(() =>
      expect(videosApi.listar).toHaveBeenLastCalledWith(expect.objectContaining({ categoria: 'Comité SIG', page: 1 }))
    )
  })

  it('cambiar el orden vuelve a consultar con orden=antiguos', async () => {
    renderConRouter(<VideosPage />)
    await screen.findByRole('heading', { name: 'Protocolo de evacuación' })

    fireEvent.change(screen.getByLabelText(/Orden/i), { target: { value: 'antiguos' } })
    await waitFor(() => expect(videosApi.listar).toHaveBeenLastCalledWith(expect.objectContaining({ orden: 'antiguos' })))
  })

  it('sin resultados muestra un mensaje, no una lista vacía', async () => {
    videosApi.listar.mockResolvedValue({ videos: [], total: 0, page: 1, pages: 1 })
    renderConRouter(<VideosPage />)
    expect(await screen.findByText('Aún no hay videos publicados.')).toBeInTheDocument()
  })
})

describe('videos subidos al VPS (proveedor local)', () => {
  const LOCAL = {
    ...VIDEO,
    id: 'v9',
    proveedor: 'local',
    url: '',
    embedUrl: null,
    miniaturaUrl: null,
    archivoVersion: '1727000000_abcdef0123456789',
  }

  it('sin miniatura, la tarjeta muestra un fotograma del propio archivo (solo metadatos)', async () => {
    videosApi.destacado.mockResolvedValue({ video: LOCAL })
    renderConRouter(<VideoDestacado />)
    const boton = await screen.findByRole('button', { name: /Reproducir video/ })
    const fotograma = boton.querySelector('video')
    expect(fotograma).not.toBeNull()
    expect(fotograma.getAttribute('src')).toBe('/api/videos/v9/archivo?v=1727000000_abcdef0123456789#t=1')
    expect(fotograma.getAttribute('preload')).toBe('metadata')
  })

  it('se reproduce en el modal con <video> nativo apuntando al archivo del servidor', async () => {
    videosApi.destacado.mockResolvedValue({ video: LOCAL })
    renderConRouter(<VideoDestacado />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ver video' }))

    const dialogo = await screen.findByRole('dialog')
    expect(dialogo.querySelector('iframe')).toBeNull()
    const reproductor = dialogo.querySelector('video')
    expect(reproductor.getAttribute('src')).toBe('/api/videos/v9/archivo?v=1727000000_abcdef0123456789')
    expect(reproductor).toHaveAttribute('controls')
  })

  it('si el navegador no puede decodificarlo, lo explica y ofrece descargarlo', async () => {
    videosApi.destacado.mockResolvedValue({ video: LOCAL })
    renderConRouter(<VideoDestacado />)
    fireEvent.click(await screen.findByRole('button', { name: 'Ver video' }))
    const dialogo = await screen.findByRole('dialog')

    fireEvent.error(dialogo.querySelector('video'))

    expect(await screen.findByText(/No se pudo reproducir este video/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Descargar el video/ })).toHaveAttribute('href', '/api/videos/v9/archivo?v=1727000000_abcdef0123456789')
  })
})
