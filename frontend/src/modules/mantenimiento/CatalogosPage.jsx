import { useEffect, useState } from 'react'
import { mantenimientoApi } from '../../api/mantenimiento.js'
import { Btn, Card, ErrorMsg, OkMsg, Input, EmptyState } from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'

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
      const data = await mantenimientoApi.catalogos.agregar(tipo, nombre.trim())
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
      const data = await mantenimientoApi.catalogos.eliminar(tipo, porEliminar._id)
      onCambio(data.lista)
    } catch (err) {
      // Caso típico: el backend rechaza porque el valor está en uso. El aviso
      // vive en la tarjeta, así que hay que cerrar el diálogo para verlo.
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
        <Input placeholder={`Nuevo ${titulo.toLowerCase().slice(0, -1)}…`} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <Btn type="submit" disabled={guardando} onClick={agregar}>Agregar</Btn>
      </form>

      <ErrorMsg>{error}</ErrorMsg>

      {items.length === 0 ? (
        <EmptyState mensaje="Catálogo vacío" />
      ) : (
        <ul className="divide-y divide-cyan-600/15 dark:divide-cyan-400/10">
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
        titulo={`¿Eliminar "${porEliminar?.nombre}" del catálogo?`}
        descripcion="Dejará de estar disponible al registrar equipos. No se puede eliminar si algún equipo lo está usando."
        confirmarLabel="Eliminar"
      />
    </Card>
  )
}

export default function CatalogosPage() {
  const [catalogos, setCatalogos] = useState({ tipos: [], marcas: [] })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  useEffect(() => {
    mantenimientoApi.catalogos
      .obtener()
      .then(setCatalogos)
      .catch((err) => setError(err.message))
  }, [])

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-slate-900 dark:text-white">Catálogos</h1>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Tipos de equipo y marcas disponibles al registrar equipos. No se puede eliminar un valor en uso.
      </p>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListaCatalogo
          titulo="Tipos de equipo"
          tipo="tipo"
          items={catalogos.tipos}
          onCambio={(lista) => setCatalogos((c) => ({ ...c, tipos: lista }))}
        />
        <ListaCatalogo
          titulo="Marcas"
          tipo="marca"
          items={catalogos.marcas}
          onCambio={(lista) => setCatalogos((c) => ({ ...c, marcas: lista }))}
        />
      </div>
    </div>
  )
}
