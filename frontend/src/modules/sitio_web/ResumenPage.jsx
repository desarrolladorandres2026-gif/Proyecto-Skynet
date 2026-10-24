import { Link } from 'react-router-dom'
import { Globe, Newspaper, CalendarDays, Megaphone, Images, CircleCheck, CircleAlert, ExternalLink } from 'lucide-react'
import { sitioWebApi } from '../../api/sitioWeb.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Badge, Btn, ErrorMsg, fmtFechaHora } from '../../components/ui.jsx'
import { COLOR_ESTADO, ETIQUETA_ESTADO, EncabezadoSeccion } from './comun.jsx'

const URL_SITIO = 'https://elterminalneiva.com'

function Tarjeta({ icono: Icono, titulo, to, permitido, cifras }) {
  const contenido = (
    <>
      <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
        <Icono className="h-4 w-4" aria-hidden="true" />
        <span className="panel-mono text-[11px] tracking-[0.1em] uppercase">{titulo}</span>
      </div>
      {cifras ? (
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {cifras.map(([valor, etiqueta]) => (
            <div key={etiqueta}>
              <dd className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">{valor}</dd>
              <dt className="text-[11px] text-slate-500 dark:text-slate-400">{etiqueta}</dt>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No disponible por ahora.</p>
      )}
    </>
  )
  const clase = 'panel-card block rounded-xl p-4'
  return permitido ? <Link to={to} className={`${clase} transition-shadow hover:shadow-md`}>{contenido}</Link> : <div className={clase}>{contenido}</div>
}

export default function ResumenPage() {
  const { tienePermiso } = useAuth()
  const puede = (permiso) => tienePermiso('sitio_web:gestionar') || tienePermiso(permiso)
  const { data, cargando, error, recargar } = useDatosConCache('sitioweb:resumen', () => sitioWebApi.resumen(), { ttlMs: 60_000 })

  const conexion = data?.conexion
  const n = data?.noticias
  const ev = data?.eventos
  const av = data?.avisos
  const me = data?.medios

  return (
    <div className="mx-auto max-w-6xl">
      <EncabezadoSeccion
        icono={Globe}
        titulo="Sitio web"
        descripcion="Publica y actualiza desde Skynet lo que el público ve en elterminalneiva.com."
      >
        <a href={URL_SITIO} target="_blank" rel="noopener noreferrer" className="panel-btn-secundario inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
          Abrir el sitio <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </EncabezadoSeccion>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando && !data ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Consultando el sitio web…</p>
      ) : data ? (
        <>
          <div
            className={`mb-5 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${
              conexion?.ok
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                : 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200'
            }`}
          >
            {conexion?.ok ? <CircleCheck className="h-4 w-4" aria-hidden="true" /> : <CircleAlert className="h-4 w-4" aria-hidden="true" />}
            <span className="flex-1">
              {conexion?.ok ? `Conectado al sitio web como "${conexion.usuario}".` : `Sin conexión con el sitio web: ${conexion?.error}`}
            </span>
            <Btn variante="secundario" className="!py-1" onClick={recargar}>Verificar de nuevo</Btn>
          </div>

          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tarjeta
              icono={Newspaper}
              titulo="Noticias"
              to="/sitio-web/noticias"
              permitido={puede('noticias:gestionar')}
              cifras={n && [[n.publicadas, 'publicadas'], [n.borradores, 'borradores'], [n.programadas, 'programadas']]}
            />
            <Tarjeta
              icono={CalendarDays}
              titulo="Eventos"
              to="/sitio-web/eventos"
              permitido={puede('eventos:gestionar')}
              cifras={ev && [[ev.publicados, 'publicados'], [ev.borradores, 'borradores']]}
            />
            <Tarjeta
              icono={Megaphone}
              titulo="Avisos"
              to="/sitio-web/avisos"
              permitido={puede('publicaciones:gestionar')}
              cifras={av && [[av.visibles, 'visibles ahora'], [av.total, 'en total']]}
            />
            <Tarjeta icono={Images} titulo="Imágenes" to="/sitio-web/medios" permitido cifras={me && [[me.total, 'en la biblioteca']]} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h2 className="panel-mono mb-2 text-[11px] tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">Noticias recientes</h2>
              {data.recientes?.length ? (
                <ul className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
                  {data.recientes.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0 truncate text-sm text-slate-800 dark:text-slate-200">{r.titulo || '(sin título)'}</span>
                      <Badge valor={COLOR_ESTADO[r.estado]} label={ETIQUETA_ESTADO[r.estado] || r.estado} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Sin noticias para mostrar.</p>
              )}
            </section>

            <section>
              <h2 className="panel-mono mb-2 text-[11px] tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">Actividad en Skynet</h2>
              {data.actividad?.length ? (
                <ul className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
                  {data.actividad.map((a) => (
                    <li key={a.id} className="py-2.5">
                      <p className="text-sm text-slate-800 dark:text-slate-200">{a.descripcion}</p>
                      <p className="panel-mono text-[11px] text-slate-500 dark:text-slate-400">{a.usuario} · {fmtFechaHora(a.fecha)}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">Aún no se ha publicado nada desde Skynet.</p>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  )
}
