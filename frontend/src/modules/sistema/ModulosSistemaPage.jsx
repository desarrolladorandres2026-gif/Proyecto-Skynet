import { useEffect, useState } from 'react'
import { Lock, Power, SlidersHorizontal } from 'lucide-react'
import { sistema } from '../../api/sistema.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Btn, Badge, Card, ErrorMsg, OkMsg, EmptyState } from '../../components/ui.jsx'

export default function ModulosSistemaPage() {
  const { refrescarUsuario } = useAuth()
  const [modulos, setModulos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [guardandoKey, setGuardandoKey] = useState(null)

  async function cargar() {
    setCargando(true)
    try {
      const data = await sistema.listarModulos()
      setModulos(data.modulos)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  async function toggle(modulo) {
    setGuardandoKey(modulo.key)
    setOk('')
    setError('')
    try {
      const data = await sistema.cambiarEstadoModulo(modulo.key, !modulo.activo)
      setModulos((lista) => lista.map((m) => (m.key === modulo.key ? data.modulo : m)))
      setOk(`Módulo "${data.modulo.nombre}" ${data.modulo.activo ? 'activado' : 'desactivado'} correctamente.`)
      // El propio sidebar del Super Admin depende de usuario.modulosDesactivados
      // (/auth/me): se refresca para que el cambio se vea sin recargar.
      await refrescarUsuario()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardandoKey(null)
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <SlidersHorizontal className="h-6 w-6 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        <div>
          <h1 className="panel-mono text-xl font-semibold tracking-wide text-slate-900 dark:text-white">Módulos del sistema</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Un módulo desactivado desaparece del menú y su API queda bloqueada para todos los roles.
            Los módulos núcleo no pueden desactivarse.
          </p>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      {cargando ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
      ) : modulos.length === 0 ? (
        <EmptyState mensaje="No hay módulos en el catálogo" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modulos.map((m) => (
            <Card key={m.key} className={m.activo ? '' : 'opacity-70'}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{m.nombre}</h2>
                    {m.esNucleo && <Lock className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />}
                  </div>
                  <p className="panel-mono mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">{m.key}</p>
                </div>
                <Badge valor={m.activo ? 'activo' : 'inactivo'} />
              </div>

              <p className="mt-3 min-h-10 text-sm text-slate-500 dark:text-slate-400">{m.descripcion}</p>

              <div className="mt-4">
                {m.esNucleo ? (
                  <p className="panel-mono text-[11px] uppercase tracking-wide text-slate-500">
                    Módulo núcleo — siempre activo
                  </p>
                ) : (
                  <Btn
                    variante={m.activo ? 'peligro' : 'primario'}
                    disabled={guardandoKey === m.key}
                    onClick={() => toggle(m)}
                    className="flex items-center gap-2"
                  >
                    <Power className="h-4 w-4" aria-hidden="true" />
                    {guardandoKey === m.key ? 'Guardando…' : m.activo ? 'Desactivar' : 'Activar'}
                  </Btn>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
