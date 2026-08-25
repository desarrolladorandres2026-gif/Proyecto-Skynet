import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FilePlus2, ShoppingCart, Wrench, TriangleAlert } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { danos as danosApi } from '../../api/danos.js'
import { catalogosApi } from '../../api/catalogos.js'
import { useDatosConCache, invalidarCachePorPrefijo } from '../../hooks/useDatosConCache.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Btn, Card, ErrorMsg, Field, Input } from '../../components/ui.jsx'
import { CatalogoSelect } from '../../components/CatalogoSelect.jsx'
import FormularioCompra, { filaVaciaCompra } from './FormularioCompra.jsx'
import FormularioServicio, { detalleServicioVacio } from './FormularioServicio.jsx'

export default function NuevoRequerimientoPage() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  // ?dano=<id> lo pone el botón "Solicitar repuesto" del detalle de un reporte
  // (modules/danos/TareasDanosPage.jsx). Deja el requerimiento enlazado al
  // daño que lo originó, en los dos sentidos.
  const [searchParams] = useSearchParams()
  const origenDano = searchParams.get('dano')

  const [tipo, setTipo] = useState('compra')
  const [cargo, setCargo] = useState(usuario?.cargo || '')

  // Misma clave que modules/catalogos/CatalogosPage.jsx: comparte caché con
  // la pantalla de administración de Dependencias y cargos.
  const { data: catalogosData } = useDatosConCache(
    'catalogos:dependenciasYCargos',
    () => catalogosApi.obtener(),
    { ttlMs: 5 * 60_000 },
  )
  const cargosDisponibles = catalogosData?.cargos || []
  const [items, setItems] = useState([filaVaciaCompra()])
  const [detalleServicio, setDetalleServicio] = useState(detalleServicioVacio())
  const [areaOProceso, setAreaOProceso] = useState('')
  const [dano, setDano] = useState(null)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  // Solo para mostrar el contexto del daño mientras se llena el formulario. Si
  // falla (p. ej. quien entra no tiene danos:gestionar), el enlace se guarda
  // igual: perder el banner no debe impedir pedir el repuesto.
  useEffect(() => {
    if (!origenDano) return
    danosApi.detalle(origenDano)
      .then(({ reporte }) => setDano(reporte))
      .catch(() => setDano(null))
  }, [origenDano])

  async function enviar(e) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const payload = { tipo, cargo }
      if (tipo === 'compra') payload.itemsCompra = items
      else {
        payload.detalleServicio = detalleServicio
        payload.areaOProceso = areaOProceso
      }
      if (origenDano) payload.origenDano = origenDano

      const { requerimiento } = await requerimientosApi.crear(payload)
      invalidarCachePorPrefijo('requerimientos:')
      navigate(`/requerimientos/${requerimiento._id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="panel-mono mb-4 flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
        <FilePlus2 className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        Nuevo requerimiento
      </h1>

      {dano && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="panel-mono flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-amber-700 dark:text-amber-300">
            <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Repuesto para un daño reportado
          </p>
          <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-200">{dano.descripcion}</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Este requerimiento quedará enlazado al reporte y aparecerá en su historial.
          </p>
        </div>
      )}

      <Card>
        <form onSubmit={enviar} className="space-y-5">
          <ErrorMsg>{error}</ErrorMsg>

          <div className="flex gap-3">
            <Btn
              variante={tipo === 'compra' ? 'primario' : 'secundario'}
              onClick={() => setTipo('compra')}
              className="flex items-center gap-1.5"
            >
              <ShoppingCart className="h-4 w-4" aria-hidden="true" /> Compra (FO-GBS-09)
            </Btn>
            <Btn
              variante={tipo === 'servicio' ? 'primario' : 'secundario'}
              onClick={() => setTipo('servicio')}
              className="flex items-center gap-1.5"
            >
              <Wrench className="h-4 w-4" aria-hidden="true" /> Servicio (FO-GBS-36)
            </Btn>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Solicitante">
              <Input disabled value={usuario?.nombre || ''} />
            </Field>
            <Field label="Cargo">
              <CatalogoSelect
                tipo="cargo"
                required
                permitirCrear={false}
                placeholder="Selecciona un cargo…"
                valor={cargo}
                onChange={setCargo}
                opciones={cargosDisponibles}
              />
            </Field>
          </div>

          {tipo === 'compra' ? (
            <FormularioCompra items={items} onChange={setItems} />
          ) : (
            <>
              <Field label="Área o proceso que requiere el servicio">
                <Input
                  required
                  placeholder="Ej: Mantenimiento, Sistemas, Logística…"
                  value={areaOProceso}
                  onChange={(e) => setAreaOProceso(e.target.value)}
                />
              </Field>
              <FormularioServicio detalle={detalleServicio} onChange={setDetalleServicio} />
            </>
          )}

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={enviando}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-60"
            >
              {enviando ? 'Enviando…' : 'Enviar a Financiero'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}
