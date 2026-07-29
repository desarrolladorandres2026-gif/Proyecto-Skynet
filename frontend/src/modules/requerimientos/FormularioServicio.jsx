import { Field, Textarea } from '../../components/ui.jsx'

export function detalleServicioVacio() {
  return { descripcionTipoServicio: '', competencia: '', laboresADesarrollar: '', requisitosSST: '' }
}

// Campos 3-5 de FO-GBS-36. El formato de servicio no tiene tabla de ítems,
// a diferencia del de compra.
export default function FormularioServicio({ detalle, onChange }) {
  function set(campo, valor) {
    onChange({ ...detalle, [campo]: valor })
  }

  return (
    <div className="space-y-4">
      <Field label="Descripción del tipo de servicio requerido">
        <Textarea required value={detalle.descripcionTipoServicio} onChange={(e) => set('descripcionTipoServicio', e.target.value)} />
      </Field>
      <Field label="Competencia (educación, formación y experiencia requerida)">
        <Textarea value={detalle.competencia} onChange={(e) => set('competencia', e.target.value)} />
      </Field>
      <Field label="Labores a desarrollar">
        <Textarea value={detalle.laboresADesarrollar} onChange={(e) => set('laboresADesarrollar', e.target.value)} />
      </Field>
      <Field label="Requisitos SST-A">
        <Textarea value={detalle.requisitosSST} onChange={(e) => set('requisitosSST', e.target.value)} />
      </Field>
    </div>
  )
}
