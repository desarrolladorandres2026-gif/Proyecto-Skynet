import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FilePlus2, ShoppingCart, Wrench } from 'lucide-react'
import { requerimientos as requerimientosApi } from '../../api/requerimientos.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Btn, Card, ErrorMsg, Field, Input } from '../../components/ui.jsx'
import FormularioCompra, { filaVaciaCompra } from './FormularioCompra.jsx'
import FormularioServicio, { detalleServicioVacio } from './FormularioServicio.jsx'

export default function NuevoRequerimientoPage() {
  const { usuario } = useAuth()
  const navigate = useNavigate()

  const [tipo, setTipo] = useState('compra')
  const [cargo, setCargo] = useState(usuario?.cargo || '')
  const [areaOProceso, setAreaOProceso] = useState('')
  const [items, setItems] = useState([filaVaciaCompra()])
  const [detalleServicio, setDetalleServicio] = useState(detalleServicioVacio())
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const payload = { tipo, cargo, areaOProceso }
      if (tipo === 'compra') payload.itemsCompra = items
      else payload.detalleServicio = detalleServicio

      const { requerimiento } = await requerimientosApi.crear(payload)
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

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Solicitante">
              <Input disabled value={usuario?.nombre || ''} />
            </Field>
            <Field label="Cargo">
              <Input required value={cargo} onChange={(e) => setCargo(e.target.value)} />
            </Field>
            <Field label="Área o proceso">
              <Input value={areaOProceso} onChange={(e) => setAreaOProceso(e.target.value)} />
            </Field>
          </div>

          {tipo === 'compra' ? (
            <FormularioCompra items={items} onChange={setItems} />
          ) : (
            <FormularioServicio detalle={detalleServicio} onChange={setDetalleServicio} />
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
