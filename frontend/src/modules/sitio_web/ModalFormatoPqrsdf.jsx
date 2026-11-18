import { useEffect, useState } from 'react'
import { FileDown } from 'lucide-react'
import { toast } from 'sonner'
import { Btn, Field, Input, Modal, Select, Textarea } from '../../components/ui.jsx'
import { CALIDADES, MEDIOS, TIPOS, TIPOS_DOC, datosDesdeRadicado, generarPdfPqrsdf } from '../../pdf/pqrsdfPdf.js'

// Formato FO-AC-02 prellenado con el radicado y con el funcionario que hace el
// trámite. Todo se puede corregir aquí antes de descargar; las firmas quedan en
// blanco para firmarlas sobre la impresión.
export default function ModalFormatoPqrsdf({ abierto, radicado, usuario, onCerrar }) {
  const [datos, setDatos] = useState(null)
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    if (abierto && radicado) setDatos(datosDesdeRadicado(radicado, usuario))
  }, [abierto, radicado, usuario])

  if (!datos) return null
  const poner = (campo) => (e) => setDatos((d) => ({ ...d, [campo]: e.target.value }))
  const texto = (campo, etiqueta, extra = {}) => (
    <Field label={etiqueta} className={extra.className}>
      <Input value={datos[campo]} onChange={poner(campo)} disabled={generando} />
    </Field>
  )
  const lista = (campo, etiqueta, opciones) => (
    <Field label={etiqueta}>
      <Select value={datos[campo]} onChange={poner(campo)} disabled={generando}>
        <option value="">— Sin marcar —</option>
        {opciones.map(([k, t]) => (
          <option key={k} value={k}>
            {t}
          </option>
        ))}
      </Select>
    </Field>
  )

  async function descargar() {
    setGenerando(true)
    try {
      await generarPdfPqrsdf(datos)
      toast.success('Formato PQRSDF generado')
    } catch (err) {
      toast.error(err.message || 'No se pudo generar el formato')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <Modal abierto={abierto} titulo="Formato PQRSDF (FO-AC-02)" onCerrar={onCerrar} ancho="max-w-2xl">
      <p className="mb-4 text-[13px] text-slate-600 dark:text-slate-400">
        Se llenó con lo que escribió el ciudadano y con tus datos como funcionario que recibe. Corrige lo que haga falta; las firmas quedan en blanco.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {texto('numero', 'No.')}
        {lista('tipo', 'Tipo', TIPOS)}
        {texto('fecha', 'Fecha')}
        {texto('hora', 'Hora')}
        {lista('discriminacion', '¿Víctima de discriminación?', [['si', 'Sí'], ['no', 'No']])}
        {texto('cualDiscriminacion', '¿Cuál?')}
        {texto('nombreCompleto', 'Nombre y apellido', { className: 'sm:col-span-2' })}
        {texto('cedula', 'Cédula / identificación')}
        {texto('telefono', 'Teléfono')}
        {texto('direccion', 'Dirección')}
        {texto('correo', 'Correo electrónico')}
        {lista('calidad', 'En calidad de', CALIDADES)}
        {lista('medio', 'Presentada mediante', MEDIOS)}
        {texto('servicio', 'Servicio donde se origina la no conformidad', { className: 'sm:col-span-2' })}
        <Field label="Descripción de la situación" className="sm:col-span-2">
          <Textarea rows={5} value={datos.descripcion} onChange={poner('descripcion')} disabled={generando} />
        </Field>
        {texto('nombres', 'Nombre(s) del titular')}
        {texto('apellidos', 'Apellido(s) del titular')}
        {lista('tipoDoc', 'Tipo de documento', TIPOS_DOC)}
        {texto('pais', 'País (si es pasaporte)')}
        {texto('funcionario', 'Nombre y cargo del funcionario que recibe', { className: 'sm:col-span-2' })}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Btn variante="fantasma" onClick={onCerrar} disabled={generando}>
          Cancelar
        </Btn>
        <Btn onClick={descargar} disabled={generando}>
          <FileDown className="h-4 w-4" aria-hidden="true" />
          {generando ? 'Generando…' : 'Descargar formato'}
        </Btn>
      </div>
    </Modal>
  )
}
