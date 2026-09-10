import { Volume2 } from 'lucide-react'
import { Select } from '../../components/ui.jsx'

// La síntesis de voz ocurre en CADA dispositivo con SUS PROPIAS voces
// instaladas (ver useAnuncioVoz.js) — no hay una sola voz que se pueda
// "transmitir" igual a todos. Este selector deja que cada persona (quien
// transmite, probando cómo suena; quien recibe, en "Mis avisos") elija entre
// las voces en español que su propio equipo ofrece, y se recuerda por
// dispositivo (localStorage). Las voces marcadas "red" (Google, etc.) suelen
// sonar bastante menos sintéticas que la voz local del sistema operativo.
export function SelectorVozAviso({ voces, vozElegidaURI, onElegir, onProbar, className = '' }) {
  if (!voces.length) return null

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Select
        value={vozElegidaURI}
        onChange={(e) => onElegir(e.target.value)}
        aria-label="Voz de los avisos en este dispositivo"
        className="max-w-[14rem] py-1.5 text-xs"
      >
        {voces.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {v.name}
            {v.localService === false ? ' · voz de red' : ''}
          </option>
        ))}
      </Select>
      <button
        type="button"
        onClick={() => onProbar(vozElegidaURI)}
        title="Probar esta voz"
        aria-label="Probar esta voz"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-brand-500/10 hover:text-brand-700 dark:text-slate-400 dark:hover:text-brand-300"
      >
        <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}
