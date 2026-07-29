import { Plus, Trash2 } from 'lucide-react'
import { Btn, Input, TablaWrap, Th, Td } from '../../components/ui.jsx'

export function filaVaciaCompra() {
  return {
    fechaSolicitud: new Date().toISOString().slice(0, 10),
    descripcionProducto: '',
    cantidad: 1,
    destino: '',
  }
}

// Tabla de FO-GBS-09: filas dinámicas, sin el tope de 13 que tenía el papel.
export default function FormularioCompra({ items, onChange }) {
  function actualizarFila(i, campo, valor) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)))
  }

  function agregarFila() {
    onChange([...items, filaVaciaCompra()])
  }

  function quitarFila(i) {
    onChange(items.filter((_, idx) => idx !== i))
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="panel-mono text-[11px] uppercase tracking-[0.1em] text-cyan-700/80 dark:text-cyan-400/80">
          Productos solicitados
        </span>
        <Btn variante="secundario" onClick={agregarFila} className="flex items-center gap-1.5 !px-2.5">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Agregar producto
        </Btn>
      </div>
      <TablaWrap>
        <thead>
          <tr>
            <Th>Fecha</Th>
            <Th>Descripción del producto</Th>
            <Th>Cantidad</Th>
            <Th>Destino</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <Td>
                <Input
                  type="date"
                  required
                  value={it.fechaSolicitud}
                  onChange={(e) => actualizarFila(i, 'fechaSolicitud', e.target.value)}
                />
              </Td>
              <Td>
                <Input
                  required
                  value={it.descripcionProducto}
                  onChange={(e) => actualizarFila(i, 'descripcionProducto', e.target.value)}
                />
              </Td>
              <Td>
                <Input
                  type="number"
                  min="1"
                  required
                  className="w-20"
                  value={it.cantidad}
                  onChange={(e) => actualizarFila(i, 'cantidad', e.target.value)}
                />
              </Td>
              <Td>
                <Input value={it.destino} onChange={(e) => actualizarFila(i, 'destino', e.target.value)} />
              </Td>
              <Td>
                {items.length > 1 && (
                  <Btn variante="peligro" onClick={() => quitarFila(i)} className="!px-2" title="Quitar producto">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Btn>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </TablaWrap>
    </div>
  )
}
