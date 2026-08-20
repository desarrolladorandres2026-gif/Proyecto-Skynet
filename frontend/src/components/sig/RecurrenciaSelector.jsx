import { Field, Select, Textarea } from '../ui.jsx'

const DIAS_SEMANA = [
  { value: 1, label: 'Lun' }, { value: 2, label: 'Mar' }, { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' }, { value: 5, label: 'Vie' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' },
]

// Un solo día seleccionado en 'dias_semana' cubre el caso "semanal" del
// encargo del módulo (ver sig-campanas.service.js).
export default function RecurrenciaSelector({ recurrencia, onChange }) {
  function actualizar(cambios) {
    onChange({ ...recurrencia, ...cambios })
  }

  function alternarDia(dia) {
    const dias = recurrencia.diasSemana.includes(dia)
      ? recurrencia.diasSemana.filter((d) => d !== dia)
      : [...recurrencia.diasSemana, dia]
    actualizar({ diasSemana: dias })
  }

  return (
    <div className="space-y-3">
      <Field label="Frecuencia">
        <Select value={recurrencia.tipo} onChange={(e) => actualizar({ tipo: e.target.value })}>
          <option value="diaria">Diaria (todos los días del rango)</option>
          <option value="dias_semana">Días específicos de la semana</option>
          <option value="personalizada">Fechas personalizadas</option>
        </Select>
      </Field>

      {recurrencia.tipo === 'dias_semana' && (
        <div className="flex flex-wrap gap-2">
          {DIAS_SEMANA.map((d) => (
            <button
              key={d.value}
              type="button"
              onClick={() => alternarDia(d.value)}
              className={
                'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ' +
                (recurrencia.diasSemana.includes(d.value)
                  ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                  : 'border-slate-200 text-slate-600 hover:border-cyan-500/40 dark:border-slate-700 dark:text-slate-300')
              }
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {recurrencia.tipo === 'personalizada' && (
        <Field label="Fechas (una por línea, AAAA-MM-DD)">
          <Textarea
            rows={4}
            placeholder={'2026-08-20\n2026-08-25\n2026-09-01'}
            value={recurrencia.fechasPersonalizadasTexto}
            onChange={(e) => actualizar({ fechasPersonalizadasTexto: e.target.value })}
          />
        </Field>
      )}
    </div>
  )
}
