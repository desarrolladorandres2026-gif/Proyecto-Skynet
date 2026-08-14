import { useEffect, useState } from 'react'
import { LayoutList } from 'lucide-react'
import { toast } from 'sonner'
import { catalogosApi } from '../../api/catalogos.js'
import { empleadosApi } from '../../api/empleados.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Btn, Card, ErrorMsg, Input, Select, EmptyState } from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'

// Edita jerarquía (padre) y jefe de UNA dependencia. Vive aparte de
// ListaCatalogo (que solo agrega/elimina VALORES) porque son permisos
// distintos: catalogos:gestionar (Administrador) vs empleados:gestionar
// (Talento Humano) — ver catalogos.routes.js.
function EstructuraDependencia({ item, dependencias, empleados, onCambio }) {
  const [padre, setPadre] = useState(item.padre?._id || item.padre || '')
  const [jefe, setJefe] = useState(item.jefe?._id || item.jefe || '')
  const [guardando, setGuardando] = useState(false)

  const hayCambios = padre !== (item.padre?._id || item.padre || '') || jefe !== (item.jefe?._id || item.jefe || '')

  async function guardar() {
    setGuardando(true)
    try {
      const data = await catalogosApi.actualizarDependencia(item._id, { padre: padre || '', jefe: jefe || '' })
      onCambio(data.lista)
      toast.success('Estructura actualizada')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mt-1.5 grid gap-1.5 sm:grid-cols-[1fr_1fr_auto]">
      <Select value={padre} onChange={(e) => setPadre(e.target.value)} className="!py-1 text-xs">
        <option value="">Sin dependencia padre</option>
        {dependencias.filter((d) => d._id !== item._id).map((d) => (
          <option key={d._id} value={d._id}>{d.nombre}</option>
        ))}
      </Select>
      <Select value={jefe} onChange={(e) => setJefe(e.target.value)} className="!py-1 text-xs">
        <option value="">Sin jefe asignado</option>
        {empleados.map((e) => (
          <option key={e._id} value={e._id}>{e.usuario?.nombre}</option>
        ))}
      </Select>
      {hayCambios && (
        <Btn variante="secundario" className="!py-1 text-xs" disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Btn>
      )}
    </div>
  )
}

function EstructuraCargo({ item, dependencias, onCambio }) {
  const [dependencia, setDependencia] = useState(item.dependencia?._id || item.dependencia || '')
  const [guardando, setGuardando] = useState(false)

  const hayCambios = dependencia !== (item.dependencia?._id || item.dependencia || '')

  async function guardar() {
    setGuardando(true)
    try {
      const data = await catalogosApi.actualizarCargo(item._id, { dependencia: dependencia || '' })
      onCambio(data.lista)
      toast.success('Dependencia del cargo actualizada')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="mt-1.5 grid gap-1.5 sm:grid-cols-[1fr_auto]">
      <Select value={dependencia} onChange={(e) => setDependencia(e.target.value)} className="!py-1 text-xs">
        <option value="">Sin dependencia asignada</option>
        {dependencias.map((d) => (
          <option key={d._id} value={d._id}>{d.nombre}</option>
        ))}
      </Select>
      {hayCambios && (
        <Btn variante="secundario" className="!py-1 text-xs" disabled={guardando} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </Btn>
      )}
    </div>
  )
}

// Mismo patrón que modules/mantenimiento/CatalogosPage.jsx (tipos/marcas de
// equipo): un ListaCatalogo genérico reutilizado para Dependencias y Cargos.
// `puedeGestionarValores` gobierna agregar/eliminar (catalogos:gestionar);
// `renderEstructura`, si viene, agrega debajo de cada fila el editor de
// jerarquía/jefe (empleados:gestionar) — ambos son independientes: una
// persona puede tener uno, otro, ambos o ninguno.
function ListaCatalogo({ titulo, tipo, items, onCambio, puedeGestionarValores, renderEstructura }) {
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

      {puedeGestionarValores && (
        <form onSubmit={agregar} className="mb-3 flex gap-2">
          <Input placeholder={`Nueva ${titulo.toLowerCase().slice(0, -1)}…`} value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Btn type="submit" disabled={guardando} onClick={agregar}>Agregar</Btn>
        </form>
      )}

      <ErrorMsg>{error}</ErrorMsg>

      {items.length === 0 ? (
        <EmptyState mensaje="Catálogo vacío" />
      ) : (
        <ul className="divide-y divide-brand-600/15 dark:divide-brand-400/10">
          {items.map((item) => (
            <li key={item._id} className="py-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-700 dark:text-slate-200">{item.nombre}</span>
                {puedeGestionarValores && (
                  <Btn variante="fantasma" className="!text-red-600 dark:!text-red-400" onClick={() => setPorEliminar(item)}>
                    Eliminar
                  </Btn>
                )}
              </div>
              {renderEstructura?.(item)}
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
  const { tienePermiso } = useAuth()
  const puedeGestionarValores = tienePermiso('catalogos:gestionar')
  const puedeEditarEstructura = tienePermiso('empleados:gestionar')

  const [catalogos, setCatalogos] = useState({ dependencias: [], cargos: [] })
  const [empleadosActivos, setEmpleadosActivos] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    catalogosApi
      .obtener()
      .then(setCatalogos)
      .catch((err) => setError(err.message))

    // Solo se necesita para el select "Jefe"; Administrador (sin
    // empleados:gestionar) no debería intentar esta consulta y recibir un 403
    // silencioso en la consola por algo que ni siquiera va a usar.
    if (puedeEditarEstructura) {
      empleadosApi
        .listar({ estado: 'activo' })
        .then((data) => setEmpleadosActivos(data.empleados))
        .catch((err) => setError(err.message))
    }
  }, [puedeEditarEstructura])

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
          puedeGestionarValores={puedeGestionarValores}
          renderEstructura={
            puedeEditarEstructura
              ? (item) => (
                  <EstructuraDependencia
                    item={item}
                    dependencias={catalogos.dependencias}
                    empleados={empleadosActivos}
                    onCambio={(lista) => setCatalogos((c) => ({ ...c, dependencias: lista }))}
                  />
                )
              : null
          }
        />
        <ListaCatalogo
          titulo="Cargos"
          tipo="cargo"
          items={catalogos.cargos}
          onCambio={(lista) => setCatalogos((c) => ({ ...c, cargos: lista }))}
          puedeGestionarValores={puedeGestionarValores}
          renderEstructura={
            puedeEditarEstructura
              ? (item) => (
                  <EstructuraCargo
                    item={item}
                    dependencias={catalogos.dependencias}
                    onCambio={(lista) => setCatalogos((c) => ({ ...c, cargos: lista }))}
                  />
                )
              : null
          }
        />
      </div>
    </div>
  )
}
