import { useEffect, useRef, useState } from 'react'
import { Megaphone, Volume2, Send, X, Search } from 'lucide-react'
import { avisosTerminal } from '../../api/avisosTerminal.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Field, Input, Select, Textarea, Btn, ErrorMsg, OkMsg } from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'
import { useAnuncioVoz } from './useAnuncioVoz.js'
import { SelectorVozAviso } from './SelectorVozAviso.jsx'

// Debe coincidir EXACTO con PREFIJO_INSTITUCIONAL en
// Backend/src/modules/avisos_terminal/avisos.service.js — el backend es la
// fuente de verdad de lo que en verdad se pronuncia; esto es solo la vista
// previa para que el administrador vea (y escuche) lo mismo antes de enviar.
const PREFIJO_INSTITUCIONAL = 'El Terminal de Transportes de Neiva informa que:'

const TEXTO_MAX = 500

function resumenDestinatarios({ tipo, usuarios, rolNombre, dependencia }) {
  if (tipo === 'todos') return 'todos los usuarios activos del sistema'
  if (tipo === 'usuario') {
    if (!usuarios.length) return 'ningún usuario seleccionado todavía'
    return usuarios.length === 1 ? usuarios[0].nombre : `${usuarios.length} usuarios seleccionados`
  }
  if (tipo === 'rol') return rolNombre ? `todo el personal con el rol "${rolNombre}"` : 'un rol por seleccionar'
  if (tipo === 'dependencia') return dependencia ? `todo el personal de "${dependencia}"` : 'una dependencia por seleccionar'
  return ''
}

export default function TransmitirAvisoPage() {
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('todos')
  const [usuariosSeleccionados, setUsuariosSeleccionados] = useState([])
  const [busquedaUsuario, setBusquedaUsuario] = useState('')
  const [resultadosBusqueda, setResultadosBusqueda] = useState([])
  const [rolId, setRolId] = useState('')
  const [dependencia, setDependencia] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const { reproducir, detener, reproduciendo, vocesDisponibles, vozElegidaURI, elegirVoz, probarVoz } = useAnuncioVoz()

  const { data: opcionesData } = useDatosConCache(
    'avisosTerminal:opciones',
    () => avisosTerminal.opcionesDestinatarios(),
    { ttlMs: 5 * 60_000 }
  )
  const opciones = opcionesData || { roles: [], dependencias: [], voces: [], vozDefecto: '' }

  // Voz institucional: la que se GENERA UNA VEZ en el servidor y escuchan
  // TODOS los destinatarios (a diferencia del selector de más abajo, que solo
  // afecta el respaldo local de este dispositivo). Se inicializa apenas
  // llega el catálogo del backend.
  const [vozInstitucional, setVozInstitucional] = useState('')
  useEffect(() => {
    if (!vozInstitucional && opciones.vozDefecto) setVozInstitucional(opciones.vozDefecto)
  }, [opciones.vozDefecto, vozInstitucional])

  const [probandoInstitucional, setProbandoInstitucional] = useState(false)
  const [esperaProbarInstitucional, setEsperaProbarInstitucional] = useState(0)
  const audioMuestraRef = useRef(null)
  const temporizadorEsperaRef = useRef(null)

  useEffect(
    () => () => {
      clearInterval(temporizadorEsperaRef.current)
      audioMuestraRef.current?.pause()
    },
    []
  )

  // Cooldown tras cada prueba: el modelo de voz institucional comparte una
  // cuota gratuita muy estrecha (3 peticiones/min PARA TODO EL PROYECTO, ver
  // Backend/src/modules/avisos_terminal/avisos.ttsCuota.js) — probar varias
  // voces seguidas sin freno podría dejar sin cupo la transmisión real.
  const ESPERA_ENTRE_PRUEBAS_S = 20
  function iniciarEsperaPrueba() {
    setEsperaProbarInstitucional(ESPERA_ENTRE_PRUEBAS_S)
    clearInterval(temporizadorEsperaRef.current)
    temporizadorEsperaRef.current = setInterval(() => {
      setEsperaProbarInstitucional((s) => {
        if (s <= 1) {
          clearInterval(temporizadorEsperaRef.current)
          return 0
        }
        return s - 1
      })
    }, 1000)
  }

  async function probarVozInstitucionalReal() {
    if (texto.trim().length < 3 || probandoInstitucional || esperaProbarInstitucional > 0) return
    setProbandoInstitucional(true)
    setError('')
    try {
      const blob = await avisosTerminal.probarVoz({ texto: texto.trim(), voz: vozInstitucional })
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioMuestraRef.current = audio
      audio.play().catch(() => {})
      audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setProbandoInstitucional(false)
      iniciarEsperaPrueba()
    }
  }

  // Búsqueda de usuarios con pequeño debounce: cada tecla no debe disparar
  // una petición — solo cuando la persona hace una pausa al escribir.
  const debounceRef = useRef(null)
  useEffect(() => {
    if (tipo !== 'usuario' || busquedaUsuario.trim().length < 2) {
      setResultadosBusqueda([])
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      avisosTerminal
        .buscarUsuarios(busquedaUsuario.trim())
        .then(({ usuarios }) => setResultadosBusqueda(usuarios || []))
        .catch(() => setResultadosBusqueda([]))
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [busquedaUsuario, tipo])

  function agregarUsuario(u) {
    setUsuariosSeleccionados((prev) => (prev.some((x) => x._id === u._id) ? prev : [...prev, u]))
    setBusquedaUsuario('')
    setResultadosBusqueda([])
  }

  function quitarUsuario(id) {
    setUsuariosSeleccionados((prev) => prev.filter((u) => u._id !== id))
  }

  const rolSeleccionado = opciones.roles.find((r) => r.id === rolId)
  const textoListo = texto.trim().length >= 3
  const destinoListo =
    tipo === 'todos' ||
    (tipo === 'usuario' && usuariosSeleccionados.length > 0) ||
    (tipo === 'rol' && Boolean(rolId)) ||
    (tipo === 'dependencia' && Boolean(dependencia))

  function armarDestinatarios() {
    if (tipo === 'usuario') return { tipo, usuarios: usuariosSeleccionados.map((u) => u._id) }
    if (tipo === 'rol') return { tipo, rol: rolId }
    if (tipo === 'dependencia') return { tipo, dependencia }
    return { tipo: 'todos' }
  }

  async function transmitir() {
    setEnviando(true)
    setError('')
    setOk('')
    try {
      const { totalDestinatarios, audioGenerado } = await avisosTerminal.transmitir({
        texto: texto.trim(),
        destinatarios: armarDestinatarios(),
        voz: vozInstitucional,
      })
      setOk(
        audioGenerado
          ? `Aviso transmitido a ${totalDestinatarios} destinatario(s) — todos escucharán la misma voz institucional.`
          : `Aviso transmitido a ${totalDestinatarios} destinatario(s). No se pudo generar la voz institucional en este momento (probablemente por el límite de la API): cada dispositivo lo leerá con su propia voz.`
      )
      setTexto('')
      setUsuariosSeleccionados([])
      setRolId('')
      setDependencia('')
    } catch (err) {
      setError(err.message)
    } finally {
      setEnviando(false)
      setConfirmando(false)
    }
  }

  const textoLocucionPreview = textoListo ? `${PREFIJO_INSTITUCIONAL} ${texto.trim()}` : ''

  return (
    <div>
      <div className="mb-1 flex items-center gap-2.5">
        <Megaphone className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Avisos Terminal de Neiva</h1>
      </div>
      <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
        Escribe un mensaje institucional y transmítelo por voz al dispositivo del personal. Empieza siempre con
        &quot;{PREFIJO_INSTITUCIONAL}&quot;, seguido exactamente de lo que escribas abajo.
      </p>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="panel-card rounded-xl p-[var(--ui-card-padding)]">
          <Field label="Mensaje del aviso">
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, TEXTO_MAX))}
              placeholder="Escribe aquí el aviso institucional…"
              rows={4}
            />
          </Field>
          <p className="mt-1 text-right text-[11px] text-slate-400">{texto.length}/{TEXTO_MAX}</p>

          <Field label="Voz institucional (la escuchan todos)" className="mt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={vozInstitucional} onChange={(e) => setVozInstitucional(e.target.value)} className="max-w-[12rem]">
                {opciones.voces.map((v) => (
                  <option key={v.id} value={v.id}>{v.nombre} — {v.descripcion}</option>
                ))}
              </Select>
              <Btn
                variante="secundario"
                disabled={texto.trim().length < 3 || probandoInstitucional || esperaProbarInstitucional > 0}
                onClick={probarVozInstitucionalReal}
              >
                <Volume2 className="h-4 w-4" aria-hidden="true" />
                {probandoInstitucional ? 'Generando…' : esperaProbarInstitucional > 0 ? `Espera ${esperaProbarInstitucional}s` : 'Probar'}
              </Btn>
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Se genera una sola vez y todos los destinatarios escuchan exactamente esta voz.
            </p>
          </Field>

          <Field label="Destinatarios" className="mt-4">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="todos">Todos los usuarios</option>
              <option value="usuario">Usuario específico</option>
              <option value="rol">Rol específico</option>
              <option value="dependencia">Dependencia / grupo</option>
            </Select>
          </Field>

          {tipo === 'usuario' && (
            <div className="mt-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <Input
                  value={busquedaUsuario}
                  onChange={(e) => setBusquedaUsuario(e.target.value)}
                  placeholder="Buscar por nombre o usuario…"
                  className="pl-9"
                />
              </div>
              {resultadosBusqueda.length > 0 && (
                <div className="panel-card mt-1.5 max-h-48 overflow-y-auto rounded-lg p-1">
                  {resultadosBusqueda.map((u) => (
                    <button
                      key={u._id}
                      type="button"
                      onClick={() => agregarUsuario(u)}
                      className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-brand-500/10"
                    >
                      <span>{u.nombre}</span>
                      <span className="text-xs text-slate-400">{u.dependencia || u.cargo || ''}</span>
                    </button>
                  ))}
                </div>
              )}
              {usuariosSeleccionados.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {usuariosSeleccionados.map((u) => (
                    <span
                      key={u._id}
                      className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 py-1 pr-1.5 pl-2.5 text-xs text-brand-700 dark:text-brand-300"
                    >
                      {u.nombre}
                      <button type="button" onClick={() => quitarUsuario(u._id)} aria-label={`Quitar ${u.nombre}`}>
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {tipo === 'rol' && (
            <Field label="Rol" className="mt-3">
              <Select value={rolId} onChange={(e) => setRolId(e.target.value)}>
                <option value="">Selecciona un rol…</option>
                {opciones.roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </Select>
            </Field>
          )}

          {tipo === 'dependencia' && (
            <Field label="Dependencia / grupo" className="mt-3">
              <Select value={dependencia} onChange={(e) => setDependencia(e.target.value)}>
                <option value="">Selecciona una dependencia…</option>
                {opciones.dependencias.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </Select>
            </Field>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Btn disabled={!textoListo || !destinoListo || enviando} onClick={() => setConfirmando(true)}>
              <Send className="h-4 w-4" aria-hidden="true" />
              Transmitir aviso
            </Btn>
          </div>

          {vocesDisponibles.length > 0 && (
            <div className="mt-4 border-t border-slate-200/60 pt-3 dark:border-slate-700/60">
              <p className="mb-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                Respaldo si la voz institucional no se puede generar (ver más abajo): con qué voz LOCAL de este dispositivo
                se leería el aviso en ese caso. No afecta lo que oirán los destinatarios.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">Voz de respaldo de este dispositivo:</span>
                <SelectorVozAviso voces={vocesDisponibles} vozElegidaURI={vozElegidaURI} onElegir={elegirVoz} onProbar={probarVoz} />
                <Btn
                  variante="fantasma"
                  disabled={!textoListo}
                  onClick={() =>
                    reproduciendo ? detener() : reproducir({ textoLocucion: textoLocucionPreview })
                  }
                >
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                  {reproduciendo ? 'Detener' : 'Probar respaldo'}
                </Btn>
              </div>
            </div>
          )}
        </div>

        <div className="panel-card rounded-xl p-[var(--ui-card-padding)]">
          <p className="panel-mono mb-2 text-[11px] tracking-[0.1em] text-brand-700/80 uppercase dark:text-brand-300/80">
            Vista previa de la locución
          </p>
          <p className="rounded-lg border border-dashed border-brand-600/25 p-3.5 text-sm text-slate-700 italic dark:border-brand-400/20 dark:text-slate-300">
            {textoListo ? (
              <>
                <span className="font-semibold not-italic">{PREFIJO_INSTITUCIONAL}</span> {texto.trim()}
              </>
            ) : (
              'Escribe un mensaje para ver (y probar) cómo sonará…'
            )}
          </p>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Se transmitirá a <strong>{resumenDestinatarios({ tipo, usuarios: usuariosSeleccionados, rolNombre: rolSeleccionado?.nombre, dependencia })}</strong>.
          </p>
        </div>
      </div>

      <ConfirmDialog
        abierto={confirmando}
        onCancelar={() => setConfirmando(false)}
        onConfirmar={transmitir}
        titulo="Transmitir aviso institucional"
        descripcion={`Vas a transmitir este aviso por voz a ${resumenDestinatarios({ tipo, usuarios: usuariosSeleccionados, rolNombre: rolSeleccionado?.nombre, dependencia })}. Esta acción no se puede deshacer.`}
        confirmarLabel="Transmitir"
        variante="primario"
        cargando={enviando}
      />
    </div>
  )
}
