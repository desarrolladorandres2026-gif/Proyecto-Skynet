import { useEffect, useState } from 'react'
import { LayoutList } from 'lucide-react'
import { catalogosApi } from '../../api/catalogos.js'
import { Btn, Card, ErrorMsg, Input, EmptyState } from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'

// Mismo patrón que modules/mantenimiento/CatalogosPage.jsx (tipos/marcas de
// equipo): un ListaCatalogo genérico reutilizado para Dependencias y Cargos.
function ListaCatalogo({ titulo, tipo, items, onCambio }) {
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  async function agregar(e) {
    e.preventDefault()
    if (!nombre.trim()) return
    setGuardando(true)
    setError('')
    try {
      const data = await catalogosApi.agregar(tipo, nombre.trim())
      onCambio(data.lista)
      setNombre('')
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  async function confirmarEliminar() {
    if (!porEliminar) return
    setError('')
    setEliminando(true)
    try {
      const data = await catalogosApi.eliminar(tipo, porEliminar._id)
      onCambio(data.lista)
    } catch (err) {
      setError(err.message)
    } finally {
      setEliminando(false)
      setPorEliminar(null)
    }
  }

  return (
    <Card>
      <h2 className="mb-3 font-semibold text-slate-900 dark:text-white">{titulo}</h2>

      <form onSubmit={agregar} className="mb-3 flex gap-2">
        <Input placeholder={`Nueva ${titulo.toLowerCase().slice(0, -1)}…`} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Btn type="submit" disabled={guardando} onClick={agregar}>Agregar</Btn>
      </form>

      <ErrorMsg>{error}</ErrorMsg>

      {items.length === 0 ? (
        <EmptyState mensaje="Catálogo vacío" />
      ) : (
        <ul className="divide-y divide-brand-600/15 dark:divide-brand-400/10">
          {items.map((item) => (
            <li key={item._id} className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700 dark:text-slate-200">{item.nombre}</span>
              <Btn variante="fantasma" className="!text-red-600 dark:!text-red-400" onClick={() => setPorEliminar(item)}>
                Eliminar
              </Btn>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        abierto={Boolean(porEliminar)}
        onCancelar={() => setPorEliminar(null)}
        onConfirmar={confirmarEliminar}
        cargando={eliminando}
        titulo={`¿Eliminar "${porEliminar?.nombre}"?`}
        descripcion="Dejará de estar disponible al seleccionarla en formularios. No se puede eliminar si algún registro la está usando."
        confirmarLabel="Eliminar"
      />
    </Card>
  )
}

export default function CatalogosPage() {
  const [catalogos, setCatalogos] = useState({ dependencias: [], cargos: [] })
  const [error, setError] = useState('')

  useEffect(() => {
    catalogosApi
      .obtener()
      .then(setCatalogos)
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <LayoutList className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Dependencias y cargos</h1>
      </div>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Valores disponibles al crear usuarios y al seleccionarlos en Requerimientos y Equipos. No se puede eliminar un valor en uso.
      </p>

      <ErrorMsg>{error}</ErrorMsg>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListaCatalogo
          titulo="Dependencias"
          tipo="dependencia"
          items={catalogos.dependencias}
          onCambio={(lista) => setCatalogos((c) => ({ ...c, dependencias: lista }))}
        />
        <ListaCatalogo
          titulo="Cargos"
          tipo="cargo"
          items={catalogos.cargos}
          onCambio={(lista) => setCatalogos((c) => ({ ...c, cargos: lista }))}
        />
      </div>
    </div>
  )
}
