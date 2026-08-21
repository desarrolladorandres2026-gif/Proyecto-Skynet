import { useEffect, useState } from 'react'
import { Brain, Plus, Pencil, Archive, ArchiveRestore, Trash2, Search, Filter, FileUp } from 'lucide-react'
import { toast } from 'sonner'
import { sig } from '../../api/sig.js'
import { Btn, Badge, Card, ErrorMsg, Input, Select, TablaWrap, Th, Td, EmptyState } from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'
import FormularioPreguntaModal from './FormularioPreguntaModal.jsx'
import ImportarPreguntasModal from './ImportarPreguntasModal.jsx'

export default function BancoPreguntasPage() {
  const [preguntas, setPreguntas] = useState([])
  const [componentes, setComponentes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false)
  const [filtroComponente, setFiltroComponente] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroTema, setFiltroTema] = useState('')
  const [filtroTexto, setFiltroTexto] = useState('')

  const [modalAbierto, setModalAbierto] = useState(false)
  const [modalImportarAbierto, setModalImportarAbierto] = useState(false)
  const [preguntaEditando, setPreguntaEditando] = useState(null)
  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  async function cargar() {
    setCargando(true)
    try {
      const [datosPreguntas, datosConfig] = await Promise.all([
        sig.banco.listar({ componenteSig: filtroComponente, estado: filtroEstado, tema: filtroTema, texto: filtroTexto }),
        sig.configuracion.obtener(),
      ])
      setPreguntas(datosPreguntas.preguntas)
      setComponentes(datosConfig.configuracion.componentes)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroComponente, filtroEstado, filtroTema])

  // Sugerencias del datalist "Tema" en el formulario: temas ya usados en el
  // banco, sin duplicados — evita que cada admin escriba el mismo tema con
  // variaciones distintas.
  const temasSugeridos = [...new Set(preguntas.map((p) => p.tema).filter(Boolean))].sort()
  const filtrosActivos = [filtroComponente, filtroEstado, filtroTema, filtroTexto].filter(Boolean).length

  function buscar(e) {
    e.preventDefault()
    cargar()
  }

  function abrirNueva() {
    setPreguntaEditando(null)
    setModalAbierto(true)
  }

  function abrirEditar(pregunta) {
    setPreguntaEditando(pregunta)
    setModalAbierto(true)
  }

  async function guardar(datos) {
    if (preguntaEditando) {
      await sig.banco.editar(preguntaEditando._id, datos)
      toast.success('Pregunta actualizada')
    } else {
      await sig.banco.crear(datos)
      toast.success('Pregunta creada')
    }
    setModalAbierto(false)
    cargar()
  }

  async function alternarArchivar(pregunta) {
    try {
      await sig.banco.archivar(pregunta._id, pregunta.estado === 'activa')
      toast.success(pregunta.estado === 'activa' ? 'Pregunta archivada' : 'Pregunta reactivada')
      cargar()
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function confirmarEliminar() {
    if (!porEliminar) return
    setEliminando(true)
    try {
      await sig.banco.eliminar(porEliminar._id)
      toast.success('Pregunta eliminada')
      cargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setEliminando(false)
      setPorEliminar(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="panel-mono flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
          <Brain className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          Banco de preguntas SIG
        </h1>
        <div className="flex items-center gap-2">
          <Btn
            variante="secundario"
            className="flex items-center gap-1.5"
            aria-expanded={filtrosAbiertos}
            onClick={() => setFiltrosAbiertos((a) => !a)}
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            Filtros
            {filtrosActivos > 0 && (
              <span className="panel-mono rounded-full bg-cyan-600 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-cyan-500">
                {filtrosActivos}
              </span>
            )}
          </Btn>
          <Btn
            variante="secundario"
            className="flex items-center gap-1.5"
            onClick={() => setModalImportarAbierto(true)}
          >
            <FileUp className="h-4 w-4" aria-hidden="true" /> Importar Excel
          </Btn>
          <Btn className="flex items-center gap-1.5" onClick={abrirNueva}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nueva pregunta
          </Btn>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      {filtrosAbiertos && (
        <Card className="mb-4">
          <form onSubmit={buscar} className="flex flex-wrap items-end gap-3">
            <div className="min-w-40 flex-1">
              <Select value={filtroComponente} onChange={(e) => setFiltroComponente(e.target.value)}>
                <option value="">Todos los componentes</option>
                {componentes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
            <div className="min-w-36">
              <Select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                <option value="">Cualquier estado</option>
                <option value="activa">Activas</option>
                <option value="archivada">Archivadas</option>
              </Select>
            </div>
            <div className="min-w-40 flex-1">
              <Input
                list="sig-temas-filtro"
                placeholder="Tema…"
                value={filtroTema}
                onChange={(e) => setFiltroTema(e.target.value)}
              />
              <datalist id="sig-temas-filtro">
                {temasSugeridos.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="min-w-48 flex-1">
              <Input
                placeholder="Buscar en el enunciado…"
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
              />
            </div>
            <Btn type="submit" variante="secundario" className="flex items-center gap-1.5" onClick={buscar}>
              <Search className="h-4 w-4" aria-hidden="true" /> Buscar
            </Btn>
          </form>
        </Card>
      )}

      {cargando ? (
        <Card>Cargando…</Card>
      ) : preguntas.length === 0 ? (
        <EmptyState mensaje="No hay preguntas que coincidan con el filtro" />
      ) : (
        <TablaWrap>
          <thead>
            <tr>
              <Th>Enunciado</Th>
              <Th>Componente</Th>
              <Th>Tema</Th>
              <Th>Estado</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {preguntas.map((p) => (
              <tr key={p._id}>
                <Td className="max-w-md">{p.enunciado}</Td>
                <Td>{p.componenteSig}</Td>
                <Td>{p.tema}</Td>
                <Td><Badge valor={p.estado} label={p.estado === 'activa' ? 'Activa' : 'Archivada'} /></Td>
                <Td className="text-right whitespace-nowrap">
                  <Btn variante="fantasma" className="!p-2" aria-label="Editar" onClick={() => abrirEditar(p)}>
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Btn>
                  <Btn variante="fantasma" className="!p-2" aria-label={p.estado === 'activa' ? 'Archivar' : 'Reactivar'} onClick={() => alternarArchivar(p)}>
                    {p.estado === 'activa' ? <Archive className="h-4 w-4" aria-hidden="true" /> : <ArchiveRestore className="h-4 w-4" aria-hidden="true" />}
                  </Btn>
                  <Btn variante="fantasma" className="!p-2 !text-red-600 dark:!text-red-400" aria-label="Eliminar" onClick={() => setPorEliminar(p)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Btn>
                </Td>
              </tr>
            ))}
          </tbody>
        </TablaWrap>
      )}

      <ImportarPreguntasModal
        abierto={modalImportarAbierto}
        onCerrar={() => setModalImportarAbierto(false)}
        onImportado={cargar}
        componentes={componentes}
      />

      <FormularioPreguntaModal
        abierto={modalAbierto}
        pregunta={preguntaEditando}
        componentes={componentes}
        temasSugeridos={temasSugeridos}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={guardar}
      />

      <ConfirmDialog
        abierto={Boolean(porEliminar)}
        onCancelar={() => setPorEliminar(null)}
        onConfirmar={confirmarEliminar}
        cargando={eliminando}
        titulo="¿Eliminar esta pregunta?"
        descripcion="Solo se puede eliminar si nunca se ha usado en una programación. Si ya se usó, archívala en su lugar."
        confirmarLabel="Eliminar"
      />
    </div>
  )
}
