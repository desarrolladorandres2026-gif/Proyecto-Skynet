import { useState } from 'react'
import { Megaphone, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { sitioWebApi } from '../../api/sitioWeb.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Badge, Btn, ErrorMsg, Field, Input, Modal, Switch, fmtFechaHora } from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'
import { EditorTexto, esContenidoEditable } from './EditorTexto.jsx'
import { EncabezadoSeccion } from './comun.jsx'

function FormularioAviso({ aviso, onCerrar, onGuardado }) {
  const editando = Boolean(aviso)
  const cuerpoEditable = !editando || esContenidoEditable(aviso.contenido)
  const [titulo, setTitulo] = useState(aviso?.titulo || '')
  const [contenido, setContenido] = useState(aviso?.contenido || '')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function enviar(e) {
    e.preventDefault()
    setError('')
    if (!titulo.trim()) return setError('El título es obligatorio')
    const datos = { titulo: titulo.trim(), ...(cuerpoEditable ? { contenido } : {}) }
    setGuardando(true)
    try {
      if (editando) await sitioWebApi.actualizarAviso(aviso.id, datos)
      else await sitioWebApi.crearAviso(datos)
      toast.success(editando ? 'Aviso guardado' : 'Aviso creado como borrador oculto')
      onGuardado()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal abierto titulo={editando ? 'Editar aviso' : 'Nuevo aviso'} onCerrar={guardando ? () => {} : onCerrar} ancho="max-w-2xl">
      <form onSubmit={enviar} className="space-y-4">
        <ErrorMsg>{error}</ErrorMsg>
        <Field label="Nombre interno del aviso">
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} disabled={guardando} autoFocus />
        </Field>
        {cuerpoEditable ? (
          <div>
            <span className="panel-mono mb-1.5 block text-[11px] tracking-[0.1em] text-brand-700/80 uppercase dark:text-brand-300/80">Lo que verá el público</span>
            <EditorTexto valorInicial={contenido} onChange={setContenido} deshabilitado={guardando} alto="min-h-40" />
          </div>
        ) : (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            Este aviso tiene una maquetación avanzada hecha en WordPress; edítalo allá para no dañarla. Aquí puedes cambiar el nombre y activarlo o apagarlo.
          </p>
        )}
        {!editando && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Un aviso nuevo copia cuándo y dónde aparece del aviso publicado más reciente, y nace oculto: lo activas desde la lista cuando esté listo.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Btn variante="secundario" onClick={onCerrar} disabled={guardando}>Cancelar</Btn>
          <Btn type="submit" disabled={guardando}>{guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear aviso'}</Btn>
        </div>
      </form>
    </Modal>
  )
}

export default function AvisosPage() {
  const [formulario, setFormulario] = useState(undefined)
  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [cambiando, setCambiando] = useState(null)

  const { data, cargando, error, recargar } = useDatosConCache('sitioweb:avisos', () => sitioWebApi.listarAvisos(), { ttlMs: 20_000 })
  const avisos = data?.avisos || []

  // Un aviso se ve en el sitio cuando está publicado Y activado. El interruptor
  // maneja las dos cosas a la vez: encender = publicar + activar; apagar = solo
  // desactivar (el aviso sigue publicado, listo para volver a encenderse).
  async function alternar(aviso) {
    setCambiando(aviso.id)
    try {
      await sitioWebApi.actualizarAviso(aviso.id, aviso.visible ? { activo: false } : { activo: true, estado: 'publish' })
      toast.success(aviso.visible ? 'Aviso oculto del sitio' : 'Aviso visible en el sitio')
      await recargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setCambiando(null)
    }
  }

  async function confirmarEliminar() {
    if (!porEliminar) return
    setEliminando(true)
    try {
      await sitioWebApi.eliminarAviso(porEliminar.id)
      toast.success('Aviso enviado a la papelera')
      setPorEliminar(null)
      await recargar()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <EncabezadoSeccion
        icono={Megaphone}
        titulo="Avisos al público"
        descripcion="Ventanas emergentes que ve quien entra a elterminalneiva.com. Enciende el interruptor para mostrar un aviso y apágalo para ocultarlo."
      >
        <Btn onClick={() => setFormulario(null)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nuevo aviso
        </Btn>
      </EncabezadoSeccion>

      <ErrorMsg>{error}</ErrorMsg>

      {cargando && !data ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Cargando avisos…</p>
      ) : avisos.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">No hay avisos en el sitio.</p>
      ) : (
        <ul className="divide-y divide-slate-200/80 dark:divide-slate-800/80">
          {avisos.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge valor={a.visible ? 'libre' : 'pendiente'} label={a.visible ? 'Visible en el sitio' : a.estado === 'draft' ? 'Borrador' : 'Oculto'} />
                </div>
                <h2 className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{a.titulo || '(sin nombre)'}</h2>
                <p className="panel-mono mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">Modificado: {fmtFechaHora(a.modificado)}</p>
                <div className="-ml-3 mt-1 flex gap-x-1">
                  <Btn variante="fantasma" className="!py-1" onClick={() => setFormulario(a)}>Editar</Btn>
                  <Btn variante="fantasma" className="!py-1 !text-red-600 dark:!text-red-400" onClick={() => setPorEliminar(a)}>Eliminar</Btn>
                </div>
              </div>
              <Switch checked={a.visible} onChange={() => alternar(a)} disabled={cambiando === a.id} label={`Mostrar el aviso ${a.titulo} en el sitio`} />
            </li>
          ))}
        </ul>
      )}

      {formulario !== undefined && (
        <FormularioAviso
          key={formulario?.id || 'nuevo'}
          aviso={formulario}
          onCerrar={() => setFormulario(undefined)}
          onGuardado={() => {
            setFormulario(undefined)
            recargar()
          }}
        />
      )}

      <ConfirmDialog
        abierto={Boolean(porEliminar)}
        onCancelar={() => setPorEliminar(null)}
        onConfirmar={confirmarEliminar}
        cargando={eliminando}
        titulo={`¿Eliminar "${porEliminar?.titulo}"?`}
        descripcion="Deja de mostrarse en el sitio web. Queda en la papelera de WordPress y se puede restaurar desde allí."
        confirmarLabel="Eliminar"
      />
    </div>
  )
}
