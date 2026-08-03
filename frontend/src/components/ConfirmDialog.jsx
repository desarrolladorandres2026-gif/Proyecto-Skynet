// Confirmación elegante (Radix AlertDialog) para reemplazar cualquier
// window.confirm() en las páginas migradas — bloquea interacción con el
// resto de la página y exige una respuesta explícita, con el mismo
// lenguaje visual del Modal.
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { cn } from '../lib/cn.js'
import { Btn } from './ui.jsx'

export function ConfirmDialog({
  abierto,
  onCancelar,
  onConfirmar,
  titulo,
  descripcion,
  confirmarLabel = 'Confirmar',
  cancelarLabel = 'Cancelar',
  variante = 'peligro',
  cargando = false,
}) {
  return (
    <AlertDialog.Root open={abierto} onOpenChange={(open) => !open && onCancelar()}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="panel-modal-backdrop fixed inset-0 z-50 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out" />
        <AlertDialog.Content
          className={cn(
            'panel-modal fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 outline-none',
            'data-[state=open]:animate-zoom-in data-[state=closed]:animate-fade-out'
          )}
        >
          <AlertDialog.Title className="panel-mono text-base font-semibold tracking-wide text-slate-900 dark:text-white">
            {titulo}
          </AlertDialog.Title>
          {descripcion && (
            <AlertDialog.Description className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              {descripcion}
            </AlertDialog.Description>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Btn variante="secundario" disabled={cargando}>
                {cancelarLabel}
              </Btn>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Btn variante={variante} disabled={cargando} onClick={onConfirmar}>
                {cargando ? 'Procesando…' : confirmarLabel}
              </Btn>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
