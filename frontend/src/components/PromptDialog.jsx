// Equivalente elegante de window.prompt(): pide uno o varios datos dentro de
// un Modal del panel, en vez del cuadro gris del navegador (que ignora el
// tema, muestra el hostname y no valida nada).
//
// Se apoya en el Modal de ui.jsx, así que hereda backdrop, animación, focus
// trap y cierre con Escape sin duplicar nada. Los campos se describen con
// datos, no con JSX, para que un llamador pida dos valores de golpe (ver
// "Aceptar riesgo" en OrdenDetallePage) sin encadenar dos prompts.
//
// Cada campo: { nombre, label, tipo, requerido, valorInicial, placeholder,
//               ayuda, min, max, filas }
// tipo: 'texto' | 'textarea' | 'numero' | 'fecha'  (por defecto 'texto')
import { useLayoutEffect, useState } from 'react'
import { Btn, ErrorMsg, Field, Input, Modal, Textarea } from './ui.jsx'

function valoresIniciales(campos) {
  return Object.fromEntries(campos.map((c) => [c.nombre, c.valorInicial ?? '']))
}

export function PromptDialog({
  abierto,
  onCancelar,
  onConfirmar,
  titulo,
  descripcion,
  campos = [],
  confirmarLabel = 'Confirmar',
  cancelarLabel = 'Cancelar',
  variante = 'primario',
  cargando = false,
  error = '',
}) {
  const [valores, setValores] = useState(() => valoresIniciales(campos))

  // Cada apertura empieza limpia: si no, el segundo rechazo llegaría con el
  // motivo del primero ya escrito. Se resetea al abrir y no al cerrar porque
  // Radix mantiene el contenido montado durante la animación de salida —
  // vaciarlo ahí se vería como un modal en blanco desvaneciéndose. Y es
  // useLayoutEffect, no useEffect, para que el reset ocurra antes del primer
  // pintado y no se alcance a ver el valor viejo.
  useLayoutEffect(() => {
    if (abierto) setValores(valoresIniciales(campos))
    // `campos` se recrea en cada render del llamador (literal inline), así que
    // depender de él dispararía el reset mientras el usuario escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  function enviar(e) {
    e.preventDefault()
    onConfirmar(valores)
  }

  const set = (nombre) => (e) => setValores((v) => ({ ...v, [nombre]: e.target.value }))

  return (
    <Modal abierto={abierto} titulo={titulo} onCerrar={onCancelar} ancho="max-w-md">
      <form onSubmit={enviar} className="space-y-4">
        {descripcion && <p className="text-sm text-slate-600 dark:text-slate-400">{descripcion}</p>}
        <ErrorMsg>{error}</ErrorMsg>

        {campos.map((campo) => (
          <Field key={campo.nombre} label={campo.label}>
            {campo.tipo === 'textarea' ? (
              <Textarea
                required={campo.requerido}
                rows={campo.filas || 3}
                placeholder={campo.placeholder}
                value={valores[campo.nombre]}
                onChange={set(campo.nombre)}
              />
            ) : (
              <Input
                required={campo.requerido}
                type={campo.tipo === 'numero' ? 'number' : campo.tipo === 'fecha' ? 'date' : 'text'}
                min={campo.min}
                max={campo.max}
                placeholder={campo.placeholder}
                value={valores[campo.nombre]}
                onChange={set(campo.nombre)}
              />
            )}
            {campo.ayuda && (
              <span className="mt-1.5 block text-xs text-slate-500 dark:text-slate-400">{campo.ayuda}</span>
            )}
          </Field>
        ))}

        <div className="flex justify-end gap-2 pt-1">
          <Btn variante="secundario" onClick={onCancelar} disabled={cargando}>
            {cancelarLabel}
          </Btn>
          <Btn type="submit" variante={variante} disabled={cargando}>
            {cargando ? 'Procesando…' : confirmarLabel}
          </Btn>
        </div>
      </form>
    </Modal>
  )
}
