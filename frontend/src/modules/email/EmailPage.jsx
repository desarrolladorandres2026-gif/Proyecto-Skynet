import { useEffect, useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import { Inbox, Star, Send, FileEdit, Trash2, Search, Mail as MailIcon } from 'lucide-react'
import { toast } from 'sonner'
import { email as emailApi } from '../../api/email.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Card, Input, Btn, ErrorMsg, EmptyState } from '../../components/ui.jsx'
import { cn } from '../../lib/cn.js'

// Sin proveedor conectado todavía (ver Backend/src/modules/email/providers):
// cada carpeta mapea 1:1 a un valor de ?carpeta= que hoy MockEmailProvider
// siempre responde vacío. Cuando exista un proveedor real, esta página no
// cambia — solo deja de estar vacía.
const CARPETAS = [
  { key: 'entrada', to: '/email', label: 'Bandeja de entrada', icon: Inbox, end: true },
  { key: 'importantes', to: '/email/importantes', label: 'Importantes', icon: Star },
  { key: 'enviados', to: '/email/enviados', label: 'Enviados', icon: Send, permiso: 'email:enviar' },
  { key: 'borradores', to: '/email/borradores', label: 'Borradores', icon: FileEdit, permiso: 'email:enviar' },
  { key: 'papelera', to: '/email/papelera', label: 'Papelera', icon: Trash2, permiso: 'email:eliminar' },
]

export default function EmailPage() {
  const { carpeta = 'entrada' } = useParams()
  const { tienePermiso } = useAuth()
  const [busqueda, setBusqueda] = useState('')
  // Resultados de una búsqueda libre (emailApi.buscar): pisan la lista de la
  // carpeta hasta que se cambia de carpeta, sin necesidad de guardarlos en
  // el caché por carpeta (no son "el contenido de la carpeta").
  const [resultadosBusqueda, setResultadosBusqueda] = useState(null)
  const [buscando, setBuscando] = useState(false)

  const { data: conexion } = useDatosConCache('email:estado', () => emailApi.estado().then((d) => d.conexion), { ttlMs: 60_000 })

  const { data: mensajesCarpeta, cargando, error } = useDatosConCache(
    `email:mensajes:${carpeta}`,
    () => emailApi.listar(carpeta).then((d) => d.mensajes),
    { ttlMs: 20_000 },
  )
  const mensajes = resultadosBusqueda ?? mensajesCarpeta ?? []

  useEffect(() => {
    setResultadosBusqueda(null)
  }, [carpeta])

  async function buscar(e) {
    e.preventDefault()
    if (!busqueda.trim()) return
    setBuscando(true)
    try {
      const data = await emailApi.buscar(busqueda.trim())
      setResultadosBusqueda(data.mensajes)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-1">
        {CARPETAS.filter((c) => !c.permiso || tienePermiso(c.permiso)).map((c) => (
          <NavLink
            key={c.key}
            to={c.to}
            end={c.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-600/10 text-brand-700 dark:bg-brand-400/10 dark:text-brand-300'
                  : 'text-slate-600 hover:bg-brand-600/5 dark:text-slate-400 dark:hover:bg-brand-400/5'
              )
            }
          >
            <c.icon className="h-4 w-4" aria-hidden="true" />
            {c.label}
          </NavLink>
        ))}
      </aside>

      <div>
        <div className="mb-4 flex items-center gap-3">
          <MailIcon className="h-6 w-6 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
          <div>
            <h1 className="panel-mono text-xl font-semibold tracking-wide text-slate-900 dark:text-white">Email</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {conexion?.conectada ? `Conectado como ${conexion.cuenta}` : 'Sin cuenta de correo conectada todavía'}
            </p>
          </div>
        </div>

        <form onSubmit={buscar} className="mb-4 flex gap-2">
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar correos…"
            aria-label="Buscar correos"
          />
          <Btn type="submit" variante="secundario" className="shrink-0">
            <Search className="h-4 w-4" aria-hidden="true" />
            Buscar
          </Btn>
        </form>

        <ErrorMsg>{error}</ErrorMsg>

        <Card>
          {cargando || buscando ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
          ) : mensajes.length === 0 ? (
            <EmptyState
              mensaje={
                conexion?.conectada
                  ? 'No hay correos en esta carpeta'
                  : 'Conecta una cuenta de correo desde Configuración para empezar a ver tus mensajes aquí'
              }
            />
          ) : (
            <ul className="divide-y divide-brand-600/10 dark:divide-brand-400/10">
              {mensajes.map((m) => (
                <li key={m.id} className="py-3">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{m.de}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{m.asunto}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
