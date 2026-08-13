import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { catalogosApi } from '../api/catalogos.js'
import { Select, Input, Btn } from './ui.jsx'

const NUEVO = '__nuevo__'

// Select reutilizado por Usuarios/Requerimientos/Equipos para elegir una
// Dependencia o un Cargo del catálogo administrable (ver modules/catalogos).
// Si el valor no existe todavía, permite crearlo sin salir del formulario ni
// necesitar ir a la pantalla "Dependencias y cargos" — pega contra el mismo
// endpoint (catalogosApi.agregar), así que el catálogo sigue siendo uno solo.
// La autorización real (permiso catalogos:gestionar) la sigue validando el
// backend: si quien usa el formulario no puede crear valores nuevos, el
// intento simplemente falla con el mensaje de error del servidor.
export function CatalogoSelect({ tipo, valor, onChange, opciones, onCrear, placeholder = 'Selecciona…', required }) {
  const [creando, setCreando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function confirmarCreacion(e) {
    e.preventDefault()
    if (!nuevoNombre.trim()) return
    setGuardando(true)
    setError('')
    try {
      const data = await catalogosApi.agregar(tipo, nuevoNombre.trim())
      onCrear(data.lista)
      onChange(data.item.nombre)
      setCreando(false)
      setNuevoNombre('')
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  if (creando) {
    return (
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          <Input
            autoFocus
            placeholder={placeholder}
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmarCreacion(e)
              if (e.key === 'Escape') { setCreando(false); setError('') }
            }}
          />
          <Btn type="button" disabled={guardando} onClick={confirmarCreacion} aria-label="Guardar">
            <Plus className="h-4 w-4" aria-hidden="true" />
          </Btn>
          <Btn type="button" variante="secundario" onClick={() => { setCreando(false); setError('') }} aria-label="Cancelar">
            <X className="h-4 w-4" aria-hidden="true" />
          </Btn>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>
    )
  }

  return (
    <Select
      required={required}
      value={valor}
      onChange={(e) => {
        if (e.target.value === NUEVO) { setCreando(true); return }
        onChange(e.target.value)
      }}
    >
      <option value="" disabled={required}>{placeholder}</option>
      {opciones.map((o) => (
        <option key={o._id} value={o.nombre}>{o.nombre}</option>
      ))}
      {/* Preserva un valor legado (texto libre anterior) que ya no esté en el
          catálogo, para no vaciarlo silenciosamente al editar un registro viejo. */}
      {valor && !opciones.some((o) => o.nombre === valor) && (
        <option value={valor}>{valor}</option>
      )}
      <option value={NUEVO}>+ Agregar nuevo…</option>
    </Select>
  )
}
