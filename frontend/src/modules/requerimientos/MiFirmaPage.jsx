import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Signature, Camera, Images, Trash2, ShieldCheck } from 'lucide-react'
import { perfil as perfilApi } from '../../api/perfil.js'
import { useDatosConCache } from '../../hooks/useDatosConCache.js'
import { Btn, Card, ErrorMsg, OkMsg } from '../../components/ui.jsx'
import { ConfirmDialog } from '../../components/ConfirmDialog.jsx'

// Registro de la rúbrica que Requerimientos estampa automáticamente al
// aprobar como Financiero (ver requerimientos.service.js: aprobarComoFinanciero
// exige usuario.firma.url antes de dejar avanzar la aprobación). Vive dentro
// del módulo de Requerimientos por ahora — es el único flujo que la usa — pero
// el registro en sí es un dato de la persona (Usuario.firma en el backend),
// no algo exclusivo de este módulo.
export default function MiFirmaPage() {
  const { data: firma, cargando, error, actualizarLocal } = useDatosConCache(
    'requerimientos:miFirma',
    () => perfilApi.firma().then((d) => d.firma),
    { ttlMs: 5 * 60_000 },
  )
  const [archivo, setArchivo] = useState(null)
  const [preview, setPreview] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [ok, setOk] = useState('')
  const inputCamaraRef = useRef(null)
  const inputGaleriaRef = useRef(null)

  useEffect(() => {
    if (!archivo) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(archivo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [archivo])

  function elegirArchivo(file) {
    if (!file) return
    setOk('')
    setArchivo(file)
  }

  function limpiarSeleccion() {
    setArchivo(null)
    if (inputCamaraRef.current) inputCamaraRef.current.value = ''
    if (inputGaleriaRef.current) inputGaleriaRef.current.value = ''
  }

  async function guardar() {
    if (!archivo) return
    setOk('')
    setSubiendo(true)
    try {
      const data = await perfilApi.guardarFirma(archivo)
      actualizarLocal(data.firma)
      limpiarSeleccion()
      setOk('Firma registrada. A partir de ahora se estampará automáticamente al aprobar requerimientos.')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubiendo(false)
    }
  }

  async function eliminar() {
    setBorrando(true)
    try {
      await perfilApi.eliminarFirma()
      actualizarLocal(null)
      setConfirmarBorrado(false)
      setOk('Firma eliminada.')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBorrando(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="panel-mono mb-1 flex items-center gap-2 text-lg font-semibold tracking-wide text-slate-900 dark:text-white">
        <Signature className="h-5 w-5 text-cyan-700 dark:text-cyan-400" aria-hidden="true" />
        Mi firma
      </h1>
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        Sube una foto de tu firma en papel. Se registra una sola vez y se estampa automáticamente en cada
        requerimiento que apruebes como Financiero — no necesitas volver a firmarlo cada vez.
      </p>

      <ErrorMsg>{error}</ErrorMsg>
      <OkMsg>{ok}</OkMsg>

      <Card className="mb-4">
        <h2 className="panel-mono mb-3 text-[11px] font-semibold tracking-[0.1em] text-brand-700/80 uppercase dark:text-brand-300/80">
          Firma registrada
        </h2>
        {cargando ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Cargando…</p>
        ) : firma ? (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {/* Fondo a cuadros: la firma procesada tiene el papel vuelto
                  transparente (ver Backend/config/cloudinary.js), así se ve
                  a simple vista que quedó bien recortada y no como un
                  rectángulo blanco pegado. */}
              <div
                className="flex h-20 w-40 items-center justify-center rounded-lg border border-slate-300 bg-[length:16px_16px] bg-[position:0_0,8px_8px] dark:border-slate-700"
                style={{
                  backgroundImage:
                    'linear-gradient(45deg, #8883 25%, transparent 25%), linear-gradient(-45deg, #8883 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #8883 75%), linear-gradient(-45deg, transparent 75%, #8883 75%)',
                  backgroundSize: '16px 16px',
                  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                }}
              >
                <img src={firma.url} alt="Tu firma" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Lista para firmar
              </div>
            </div>
            <Btn
              variante="peligro"
              onClick={() => setConfirmarBorrado(true)}
              className="flex items-center gap-1.5"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Eliminar
            </Btn>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Todavía no has registrado tu firma. Si apruebas requerimientos como Financiero, la necesitarás
            antes de poder aprobar el primero.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="panel-mono mb-3 text-[11px] font-semibold tracking-[0.1em] text-brand-700/80 uppercase dark:text-brand-300/80">
          {firma ? 'Reemplazar firma' : 'Registrar firma'}
        </h2>

        <input
          ref={inputCamaraRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => elegirArchivo(e.target.files?.[0])}
          className="sr-only"
        />
        <input
          ref={inputGaleriaRef}
          type="file"
          accept="image/*"
          onChange={(e) => elegirArchivo(e.target.files?.[0])}
          className="sr-only"
        />

        {preview && (
          <div className="mb-3 flex justify-center rounded-lg border border-slate-300 bg-white p-3 dark:border-slate-700">
            <img src={preview} alt="Vista previa" className="max-h-40 object-contain" />
          </div>
        )}

        <div className="flex gap-2">
          <Btn
            variante="secundario"
            onClick={() => inputCamaraRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-2"
          >
            <Camera className="h-4 w-4" aria-hidden="true" /> Cámara
          </Btn>
          <Btn
            variante="secundario"
            onClick={() => inputGaleriaRef.current?.click()}
            className="flex flex-1 items-center justify-center gap-2"
          >
            <Images className="h-4 w-4" aria-hidden="true" /> Galería
          </Btn>
        </div>

        {archivo && (
          <div className="mt-3 flex justify-end gap-2">
            <Btn variante="fantasma" onClick={limpiarSeleccion} disabled={subiendo}>
              Cancelar
            </Btn>
            <Btn onClick={guardar} disabled={subiendo}>
              {subiendo ? 'Guardando…' : 'Guardar firma'}
            </Btn>
          </div>
        )}
      </Card>

      <ConfirmDialog
        abierto={confirmarBorrado}
        titulo="Eliminar tu firma"
        descripcion="Los requerimientos que ya aprobaste conservan la firma con la que se aprobaron. Solo se borra el registro para aprobaciones futuras."
        confirmarLabel="Eliminar"
        variante="peligro"
        cargando={borrando}
        onConfirmar={eliminar}
        onCancelar={() => setConfirmarBorrado(false)}
      />
    </div>
  )
}
