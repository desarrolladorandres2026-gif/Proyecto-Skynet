import { useState } from 'react'
import { Filter } from 'lucide-react'
import { Btn, Card, Field, Input, Select } from '../ui.jsx'

// Filtros combinables reutilizados por Dashboard, Reporte individual y Plan
// de refuerzo (sección 12 del encargo: fecha, dependencia, cargo,
// componente, tema, resultado). `mostrarResultado` se apaga en las pantallas
// donde no aplica (plan de refuerzo, por ejemplo).
//
// Colapsado por defecto detrás de un botón "Filtros": la pantalla no debe
// abrumar con 5-6 campos visibles todo el tiempo, solo cuando el usuario los
// pide — con una insignia mostrando cuántos filtros ya están activos aunque
// el panel esté cerrado.
export default function FiltrosDashboardSig({ filtros, onChange, onAplicar, componentes, catalogos, mostrarResultado = true }) {
  const [abierto, setAbierto] = useState(false)

  function set(campo, valor) {
    onChange({ ...filtros, [campo]: valor })
  }

  const activos = Object.values(filtros).filter(Boolean).length

  return (
    <div className="mb-4">
      <Btn
        variante="secundario"
        className="flex items-center gap-1.5"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
      >
        <Filter className="h-4 w-4" aria-hidden="true" />
        Filtros
        {activos > 0 && (
          <span className="panel-mono rounded-full bg-cyan-600 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-cyan-500">
            {activos}
          </span>
        )}
      </Btn>

      {abierto && (
        <Card className="mt-2">
          <form
            onSubmit={(e) => { e.preventDefault(); onAplicar() }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <Field label="Desde">
              <Input type="date" value={filtros.desde} onChange={(e) => set('desde', e.target.value)} />
            </Field>
            <Field label="Hasta">
              <Input type="date" value={filtros.hasta} onChange={(e) => set('hasta', e.target.value)} />
            </Field>
            <Field label="Dependencia">
              <Select value={filtros.dependencia} onChange={(e) => set('dependencia', e.target.value)}>
                <option value="">Todas</option>
                {catalogos?.dependencias?.map((d) => (
                  <option key={d._id} value={d.nombre}>{d.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field label="Cargo">
              <Select value={filtros.cargo} onChange={(e) => set('cargo', e.target.value)}>
                <option value="">Todos</option>
                {catalogos?.cargos?.map((c) => (
                  <option key={c._id} value={c.nombre}>{c.nombre}</option>
                ))}
              </Select>
            </Field>
            <Field label="Componente SIG">
              <Select value={filtros.componenteSig} onChange={(e) => set('componenteSig', e.target.value)}>
                <option value="">Todos</option>
                {componentes?.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            <Field label="Tema">
              <Input value={filtros.tema} onChange={(e) => set('tema', e.target.value)} placeholder="Coincidencia exacta…" />
            </Field>
            {mostrarResultado && (
              <Field label="Resultado">
                <Select value={filtros.resultado} onChange={(e) => set('resultado', e.target.value)}>
                  <option value="">Correctas e incorrectas</option>
                  <option value="correcta">Solo correctas</option>
                  <option value="incorrecta">Solo incorrectas</option>
                </Select>
              </Field>
            )}
            <div className="flex items-end">
              <Btn type="submit" className="w-full" onClick={onAplicar}>Aplicar filtros</Btn>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}
