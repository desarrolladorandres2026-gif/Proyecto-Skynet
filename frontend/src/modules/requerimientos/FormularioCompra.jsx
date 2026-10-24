import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Btn, Field, Input, Modal, Select, TablaWrap, Th, Td } from '../../components/ui.jsx'
import ArticuloSelector from './ArticuloSelector.jsx'

export function filaVaciaCompra() {
  return {
    fechaSolicitud: new Date().toISOString().slice(0, 10),
    descripcionProducto: '',
    articulo: null,
    presentacion: '',
    cantidad: 1,
    destino: '',
  }
}

// Tabla de FO-GBS-09: filas dinámicas, sin el tope de 13 que tenía el papel.
export default function FormularioCompra({ items, onChange }) {
  function actualizarFila(i, campo, valor) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)))
  }

  function actualizarVarios(i, cambios) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...cambios } : it)))
  }

  // Escribir sobre un ítem ya vinculado lo desvincula: el texto dejó de ser el
  // del artículo, y vincular algo distinto en silencio sería peor que pedir
  // que se vuelva a elegir.
  function cambiarTexto(i, texto) {
    const it = items[i]
    const sigueVinculado = it.articulo && texto === it.articulo.nombre
    actualizarVarios(i, { descripcionProducto: texto, ...(sigueVinculado ? {} : { articulo: null, presentacion: '' }) })
  }

  function elegirArticulo(i, articulo) {
    actualizarVarios(i, { descripcionProducto: articulo.nombre, articulo, presentacion: '' })
  }

  function campoDescripcion(it, i) {
    return (
      <>
        <ArticuloSelector
          required
          texto={it.descripcionProducto}
          vinculado={Boolean(it.articulo)}
          onTexto={(texto) => cambiarTexto(i, texto)}
          onElegir={(articulo) => elegirArticulo(i, articulo)}
        />
        {it.articulo?.presentaciones?.length > 0 && (
          <Select className="mt-2" aria-label="Presentación" value={it.presentacion || ''} onChange={(e) => actualizarFila(i, 'presentacion', e.target.value)}>
            <option value="">Por unidad</option>
            {it.articulo.presentaciones.map((p) => (
              <option key={p.nombre} value={p.nombre}>{p.nombre} (x{p.factor})</option>
            ))}
          </Select>
        )}
      </>
    )
  }

  function agregarFila() {
    onChange([...items, filaVaciaCompra()])
  }

  // Índice del producto pendiente de confirmar; null = modal cerrado.
  const [filaAQuitar, setFilaAQuitar] = useState(null)

  function quitarFila(i) {
    onChange(items.filter((_, idx) => idx !== i))
  }

  function confirmarQuitar() {
    quitarFila(filaAQuitar)
    setFilaAQuitar(null)
  }

  const productoAQuitar = filaAQuitar !== null ? items[filaAQuitar] : null

  return (
    <div>
      <Modal abierto={filaAQuitar !== null} titulo="Quitar producto" onCerrar={() => setFilaAQuitar(null)}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            ¿Seguro que quieres quitar el producto {filaAQuitar !== null ? filaAQuitar + 1 : ''}
            {productoAQuitar?.descripcionProducto ? ` («${productoAQuitar.descripcionProducto}»)` : ''} de este
            requerimiento?
          </p>
          <div className="flex justify-end gap-2">
            <Btn variante="secundario" onClick={() => setFilaAQuitar(null)}>Cancelar</Btn>
            <Btn variante="peligro" onClick={confirmarQuitar} className="flex items-center gap-1.5">
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Quitar
            </Btn>
          </div>
        </div>
      </Modal>
      <div className="mb-2 flex items-center justify-between">
        <span className="panel-mono text-[11px] uppercase tracking-[0.1em] text-brand-700/80 dark:text-brand-400/80">
          Productos solicitados
        </span>
        <Btn variante="secundario" onClick={agregarFila} className="flex items-center gap-1.5 !px-2.5">
          <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Agregar producto
        </Btn>
      </div>
      {/* Debajo de sm, la tabla de 4 inputs obliga a scrollear horizontalmente
          para llenar cada campo (no se ve "Descripción" mientras se escribe
          "Fecha") — cada producto pasa a ser su propia tarjeta con los campos
          apilados, mismos Field/Input que ya usa el resto del formulario. */}
      <div className="grid gap-3 sm:hidden">
        {items.map((it, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-brand-600/15 p-3 dark:border-brand-400/10">
            <div className="flex items-center justify-between">
              <span className="panel-mono text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Producto {i + 1}
              </span>
              {items.length > 1 && (
                <Btn variante="peligro" onClick={() => setFilaAQuitar(i)} className="!px-2" title="Quitar producto" aria-label="Quitar producto">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Btn>
              )}
            </div>
            <Field label="Fecha">
              <Input
                type="date"
                required
                value={it.fechaSolicitud}
                onChange={(e) => actualizarFila(i, 'fechaSolicitud', e.target.value)}
              />
            </Field>
            <div>
              <span className="panel-mono mb-1.5 block text-[11px] tracking-[0.1em] text-brand-700/80 uppercase dark:text-brand-300/80">
                Descripción del producto
              </span>
              {campoDescripcion(it, i)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Cantidad">
                <Input
                  type="number"
                  min="1"
                  required
                  value={it.cantidad}
                  onChange={(e) => actualizarFila(i, 'cantidad', e.target.value)}
                />
              </Field>
              <Field label="Destino">
                <Input value={it.destino} onChange={(e) => actualizarFila(i, 'destino', e.target.value)} />
              </Field>
            </div>
          </div>
        ))}
      </div>

      <TablaWrap className="hidden sm:block">
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
              <Td className="min-w-[16rem]">{campoDescripcion(it, i)}</Td>
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
                  <Btn variante="peligro" onClick={() => setFilaAQuitar(i)} className="!px-2" title="Quitar producto" aria-label="Quitar producto">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
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
