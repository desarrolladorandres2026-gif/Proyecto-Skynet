// Paleta de comandos (⌘K / Ctrl+K, estilo Linear/Raycast): busca por nombre
// de módulo/página en MODULOS_REGISTRO (vía modulosVisibles ya filtrado por
// permisos, el mismo que arma el sidebar) y navega al elegir uno.
import { useEffect, useMemo, useState } from 'react'
import { Command } from 'cmdk'
import { Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function useCommandPalette() {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAbierto((v) => !v)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return [abierto, setAbierto]
}

export function CommandPalette({ abierto, onAbrirCambio, modulosVisibles }) {
  const navigate = useNavigate()

  const grupos = useMemo(
    () => modulosVisibles.map((m) => ({ label: m.label, items: m.items })).filter((g) => g.items.length > 0),
    [modulosVisibles]
  )

  function ir(to) {
    onAbrirCambio(false)
    navigate(to)
  }

  return (
    <Command.Dialog
      open={abierto}
      onOpenChange={onAbrirCambio}
      label="Buscar módulos y páginas"
      shouldFilter
      className="fixed top-[15svh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-soft-lg outline-none dark:border-white/10 dark:bg-slate-900"
      overlayClassName="panel-modal-backdrop fixed inset-0 z-50 data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out"
      contentClassName="data-[state=open]:animate-zoom-in data-[state=closed]:animate-fade-out"
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-white/10">
        <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <Command.Input
          autoFocus
          placeholder="Buscar un módulo o página…"
          className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
        />
      </div>
      <Command.List className="max-h-[50svh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-slate-400">Sin resultados.</Command.Empty>
        {grupos.map((g) => (
          <Command.Group
            key={g.label}
            heading={g.label}
            className="panel-mono px-2 py-1.5 text-[11px] font-semibold tracking-[0.1em] text-slate-400 uppercase dark:text-slate-500 [&_[cmdk-group-items]]:mt-1"
          >
            {g.items.map((item) => (
              <Command.Item
                key={item.to}
                value={`${g.label} ${item.label}`}
                onSelect={() => ir(item.to)}
                className="flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-700 data-[selected=true]:bg-brand-600/10 data-[selected=true]:text-brand-700 dark:text-slate-200 dark:data-[selected=true]:bg-brand-400/10 dark:data-[selected=true]:text-brand-300"
              >
                {item.label}
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command.Dialog>
  )
}
