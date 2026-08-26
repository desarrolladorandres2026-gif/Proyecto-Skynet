import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import {
  SlidersHorizontal,
  Mail,
  Smartphone,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertTriangle,
  History,
  ShieldCheck,
  Wrench,
  TriangleAlert,
  FileText,
  CalendarDays,
  Brain,
  Server,
  BellOff,
} from 'lucide-react'
import { notificaciones as notificacionesApi } from '../../api/notificaciones.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Card, Switch, ErrorMsg, OkMsg, Badge, Btn } from '../../components/ui.jsx'
import { cn } from '../../lib/cn.js'

const ICONOS_CATEGORIA = {
  mantenimiento: Wrench,
  danos: TriangleAlert,
  requerimientos: FileText,
  ausencias: CalendarDays,
  sig_pregunta_dia: Brain,
  plataforma: Server,
}

export function NotificacionesAdminTabs() {
  const location = useLocation()
  const esHistorial = location.pathname.includes('/historial')
  const esCanales = location.pathname.includes('/canales')

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
      <Link
        to="/notificaciones/historial"
        className={cn(
          'flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200',
          esHistorial
            ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 shadow-sm'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
        )}
      >
        <History className="h-4 w-4" />
        <span>Historial de envíos</span>
      </Link>

      <Link
        to="/notificaciones/canales"
        className={cn(
          'flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-200',
          esCanales
            ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 shadow-sm'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
        )}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span>Elección de notificaciones</span>
        <span className="rounded-full bg-cyan-600/10 dark:bg-cyan-400/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
          Canales
        </span>
      </Link>
    </div>
  )
}

function calcularModo(catConfig) {
  if (!catConfig || catConfig.activo === false) return 'desactivado'
  if (catConfig.email && catConfig.push) return 'ambos'
  if (catConfig.push && !catConfig.email) return 'solo_dispositivo'
  if (catConfig.email && !catConfig.push) return 'solo_email'
  return 'desactivado'
}

export default function EleccionNotificacionesPage() {
  const { data, error, actualizarLocal } = useDatosConCache(
    'notificaciones:configuracionCanales',
    () =>
      Promise.all([notificacionesApi.configuracionCanales(), notificacionesApi.categorias()]).then(([cfg, cats]) => ({
        configuracion: cfg,
        categorias: cats.categorias,
      })),
    { ttlMs: 60_000 }
  )

  const configuracion = data?.configuracion || null
  const categorias = data?.categorias || []
  const [guardando, setGuardando] = useState(false)
  const [okMsg, setOkMsg] = useState('')

  async function guardarCambios(cambios, actualizarEstadoLocal) {
    if (actualizarEstadoLocal) {
      actualizarLocal((d) => ({
        ...d,
        configuracion: actualizarEstadoLocal(d.configuracion),
      }))
    }
    setGuardando(true)
    setOkMsg('')
    try {
      const res = await notificacionesApi.actualizarConfiguracionCanales(cambios)
      actualizarLocal((d) => ({ ...d, configuracion: res }))
      setOkMsg('Configuración de canales guardada correctamente.')
      toast.success('Canales de notificación actualizados')
    } catch (err) {
      toast.error(err.message || 'Error al guardar la configuración')
      notificacionesApi
        .configuracionCanales()
        .then((cfg) => actualizarLocal((d) => ({ ...d, configuracion: cfg })))
        .catch(() => {})
    } finally {
      setGuardando(false)
    }
  }

  function cambiarModoCategoria(categoriaKey, nuevoModo) {
    let email = true
    let push = true
    let activo = true

    if (nuevoModo === 'solo_dispositivo') {
      email = false
      push = true
      activo = true
    } else if (nuevoModo === 'solo_email') {
      email = true
      push = false
      activo = true
    } else if (nuevoModo === 'ambos') {
      email = true
      push = true
      activo = true
    } else if (nuevoModo === 'desactivado') {
      email = false
      push = false
      activo = false
    }

    guardarCambios(
      {
        canales: {
          [categoriaKey]: { email, push, activo },
        },
      },
      (prev) => ({
        ...prev,
        canales: {
          ...prev.canales,
          [categoriaKey]: { email, push, activo },
        },
      })
    )
  }

  // Preajustes rápidos para gestión de cuota de correo Resend
  function aplicarPresetAhorroResend() {
    const nuevosCanales = {}
    categorias.forEach((cat) => {
      if (cat.key === 'sig_pregunta_dia' || cat.key === 'mantenimiento' || cat.key === 'danos') {
        // Eventos diarios de alta frecuencia -> Solo dispositivo (cero emails consumidos)
        nuevosCanales[cat.key] = { email: false, push: true, activo: true }
      } else {
        // Aprobaciones críticas (Requerimientos, Ausencias, Plataforma) -> Ambos canales
        nuevosCanales[cat.key] = { email: true, push: true, activo: true }
      }
    })

    guardarCambios(
      {
        emailGlobal: { activo: true },
        pushGlobal: { activo: true },
        canales: nuevosCanales,
      },
      (prev) => ({
        ...prev,
        emailGlobal: { activo: true },
        pushGlobal: { activo: true },
        canales: nuevosCanales,
      })
    )
  }

  function aplicarPresetSoloDispositivo() {
    const nuevosCanales = {}
    categorias.forEach((cat) => {
      nuevosCanales[cat.key] = { email: false, push: true, activo: true }
    })

    guardarCambios(
      {
        emailGlobal: { activo: true },
        pushGlobal: { activo: true },
        canales: nuevosCanales,
      },
      (prev) => ({
        ...prev,
        canales: nuevosCanales,
      })
    )
  }

  function aplicarPresetTodosAmbos() {
    const nuevosCanales = {}
    categorias.forEach((cat) => {
      nuevosCanales[cat.key] = { email: true, push: true, activo: true }
    })

    guardarCambios(
      {
        emailGlobal: { activo: true },
        pushGlobal: { activo: true },
        canales: nuevosCanales,
      },
      (prev) => ({
        ...prev,
        canales: nuevosCanales,
      })
    )
  }

  if (!configuracion) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <NotificacionesAdminTabs />
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <NotificacionesAdminTabs />

      {/* Cabecera Principal */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="h-6 w-6 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Elección de notificaciones
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Control de canales de transmisión: decide qué eventos se envían por correo electrónico (Resend), cuáles por
            notificaciones al dispositivo o a ambos, protegiendo la cuota diaria de emails.
          </p>
        </div>
      </div>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{okMsg}</OkMsg>

      {/* Banner de Control de Cuota Resend & Preajustes */}
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-950/20 via-slate-900/40 to-slate-950/60 p-5 shadow-lg backdrop-blur-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                Optimización de Cuota Diaria de Correo (Resend)
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Eventos frecuentes como los <strong>Cuestionarios Programados SIG</strong> o novedades de{' '}
              <strong>Mantenimiento</strong> pueden consumir decenas de correos diarios. Configurarlos en{' '}
              <span className="text-cyan-300 font-medium">Solo Dispositivo</span> garantiza que los trabajadores reciban
              sus avisos al instante en su teléfono o navegador sin agotar el límite de Resend.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Btn
              variante="primario"
              disabled={guardando}
              onClick={aplicarPresetAhorroResend}
              className="text-xs py-1.5 px-3 shadow-cyan-500/20"
            >
              <Zap className="h-3.5 w-3.5 mr-1 text-amber-300" />
              Modo Ahorro Cuota (Recomendado)
            </Btn>
            <Btn
              variante="secundario"
              disabled={guardando}
              onClick={aplicarPresetSoloDispositivo}
              className="text-xs py-1.5 px-3"
            >
              <Smartphone className="h-3.5 w-3.5 mr-1" />
              Solo Dispositivo
            </Btn>
            <Btn
              variante="secundario"
              disabled={guardando}
              onClick={aplicarPresetTodosAmbos}
              className="text-xs py-1.5 px-3"
            >
              <Mail className="h-3.5 w-3.5 mr-1" />
              Ambos Canales
            </Btn>
          </div>
        </div>
      </div>

      {/* Interruptores Maestros Globales */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Interruptores Maestros Globales</h2>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Control general de emergencia. Si desactivas un canal aquí, ningún evento no transaccional saldrá por esa vía,
          independientemente de la categoría.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Transmisión por Correo (Resend)</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {configuracion.emailGlobal.activo ? 'Canal de email activo' : 'Pausado globalmente'}
                </p>
              </div>
            </div>
            <Switch
              checked={configuracion.emailGlobal.activo}
              onChange={(v) =>
                guardarCambios(
                  { emailGlobal: { activo: v } },
                  (prev) => ({ ...prev, emailGlobal: { activo: v } })
                )
              }
              label="Activar o pausar correo global"
            />
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Transmisión al Dispositivo (Push)</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {configuracion.pushGlobal.activo ? 'Canal push activo' : 'Pausado globalmente'}
                </p>
              </div>
            </div>
            <Switch
              checked={configuracion.pushGlobal.activo}
              onChange={(v) =>
                guardarCambios(
                  { pushGlobal: { activo: v } },
                  (prev) => ({ ...prev, pushGlobal: { activo: v } })
                )
              }
              label="Activar o pausar push global"
            />
          </div>
        </div>
      </Card>

      {/* Matriz de Elección por Categoría */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Vías de transmisión por Categoría de Eventos
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Selecciona el canal de entrega para cada módulo del sistema.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {categorias.map((cat) => {
            const Icono = ICONOS_CATEGORIA[cat.key] || SlidersHorizontal
            const catConfig = configuracion.canales?.[cat.key] || { email: true, push: true, activo: true }
            const modo = calcularModo(catConfig)

            return (
              <div
                key={cat.key}
                className={cn(
                  'rounded-2xl border transition-all duration-300 p-4',
                  'bg-white/80 dark:bg-slate-900/60 shadow-sm backdrop-blur-sm',
                  catConfig.activo === false
                    ? 'border-slate-200 dark:border-slate-800 opacity-60'
                    : 'border-slate-200/80 dark:border-cyan-500/20 hover:border-cyan-400/40 hover:shadow-md'
                )}
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  {/* Info de Categoría */}
                  <div className="flex items-start gap-3.5 max-w-md">
                    <div
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-300',
                        cat.key === 'sig_pregunta_dia'
                          ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                          : cat.key === 'danos'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                            : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20'
                      )}
                    >
                      <Icono className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{cat.nombre}</h3>
                        {cat.key === 'sig_pregunta_dia' && (
                          <span className="rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-600 dark:text-purple-300">
                            Alto volumen diario
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{cat.descripcion}</p>
                    </div>
                  </div>

                  {/* Selector de Canal / Modo */}
                  <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 dark:bg-slate-950/60 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      disabled={guardando}
                      onClick={() => cambiarModoCategoria(cat.key, 'ambos')}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200',
                        modo === 'ambos'
                          ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-600/30'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800'
                      )}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Ambos</span>
                    </button>

                    <button
                      type="button"
                      disabled={guardando}
                      onClick={() => cambiarModoCategoria(cat.key, 'solo_dispositivo')}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200',
                        modo === 'solo_dispositivo'
                          ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800'
                      )}
                      title="Notifica en el teléfono / navegador sin gastar cuota de correo"
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      <span>Solo Dispositivo</span>
                      {modo === 'solo_dispositivo' && (
                        <span className="text-[10px] bg-emerald-700/50 px-1.5 py-0.2 rounded text-emerald-100">
                          Ahorro
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={guardando}
                      onClick={() => cambiarModoCategoria(cat.key, 'solo_email')}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200',
                        modo === 'solo_email'
                          ? 'bg-sky-600 text-white shadow-sm shadow-sky-600/30'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800'
                      )}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      <span>Solo Correo</span>
                    </button>

                    <button
                      type="button"
                      disabled={guardando}
                      onClick={() => cambiarModoCategoria(cat.key, 'desactivado')}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200',
                        modo === 'desactivado'
                          ? 'bg-rose-600 text-white shadow-sm shadow-rose-600/30'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800'
                      )}
                      title="No envía email ni push; solo queda registrado internamente en la campana"
                    >
                      <BellOff className="h-3.5 w-3.5" />
                      <span>Desactivado</span>
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
