import { useEffect, useState } from 'react'
import { auditoria as auditoriaApi } from '../../api/auditoria.js'
import {
  Badge, Card, ErrorMsg, Field, Input, TablaWrap, Th, Td, EmptyState, Pager, fmtFechaHora,
} from '../../components/ui.jsx'

export default function AuditoriaPage() {
  const [registros, setRegistros] = useState([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [modulo, setModulo] = useState('')
  const [accion, setAccion] = useState('')

  async function cargar() {
    setCargando(true)
    try {
      const data = await auditoriaApi.listar({ page, modulo: modulo || undefined, accion: accion || undefined })
      setRegistros(data.registros)
      setPages(data.pages)
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
  }, [page])

  function buscar(e) {
    e.preventDefault()
    setPage(1)
    cargar()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Auditoría</h1>
      </div>

      <ErrorMsg>{error}</ErrorMsg>

      <form onSubmit={buscar} className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Módulo" className="w-40">
          <Input value={modulo} onChange={(e) => setModulo(e.target.value)} placeholder="roles" />
        </Field>
        <Field label="Acción" className="w-40">
          <Input value={accion} onChange={(e) => setAccion(e.target.value)} placeholder="actualizar" />
        </Field>
        <button
          type="submit"
          className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
        >
          Filtrar
        </button>
      </form>

      {cargando ? (
        <Card>Cargando…</Card>
      ) : registros.length === 0 ? (
        <EmptyState mensaje="No hay registros de auditoría" />
      ) : (
        <>
          <TablaWrap>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Usuario</Th>
                <Th>Rol</Th>
                <Th>Módulo</Th>
                <Th>Acción</Th>
                <Th>Descripción</Th>
                <Th>Resultado</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {registros.map((r) => (
                <tr key={r._id}>
                  <Td>{fmtFechaHora(r.creadoEn)}</Td>
                  <Td>{r.usuarioNombre}</Td>
                  <Td>{r.rolSlug}</Td>
                  <Td>{r.modulo}</Td>
                  <Td>{r.accion}</Td>
                  <Td>{r.descripcion}</Td>
                  <Td><Badge valor={r.resultado} /></Td>
                </tr>
              ))}
            </tbody>
          </TablaWrap>
          <Pager page={page} pages={pages} onPage={setPage} />
        </>
      )}
    </div>
  )
}
