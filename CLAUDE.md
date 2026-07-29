# Skynet — instrucciones del proyecto

## Iconografía: solo SVG (lucide-react), nunca emojis

En `frontend/`, todo icono de interfaz debe ser un componente de
[`lucide-react`](https://lucide.dev/icons/) (ya instalado como dependencia).
No se usan caracteres emoji (🛠️ 🎫 ⚙️ 📎 ✕ 🔊 etc.) como iconos en JSX.

**Por qué:** los emojis renderizan distinto entre SO/navegador (Windows,
macOS, fuentes de sistema), no heredan `color`/`currentColor` de forma
confiable, y no encajan con el tema HUD cian del panel (`layout/panel.css`,
`auth/login.css`). Los iconos SVG sí escalan, heredan color, y se pueden
animar/tematizar igual que el resto de la UI.

**Cómo usarlos:**
```jsx
import { Settings, Paperclip, X } from 'lucide-react'

<Settings className="h-4 w-4" aria-hidden="true" />
```
Tamaño vía clases Tailwind (`h-4 w-4`, etc.), color vía `text-*` (lucide usa
`currentColor` por defecto). Siempre `aria-hidden="true"` si el icono es
puramente decorativo (ya hay texto/label junto a él).

**Excepción documentada:** el contenido del módulo de inducción
(`frontend/src/modules/induccion/induccionData.js`) es texto/HTML de un curso
institucional (no chrome de interfaz), renderizado con
`dangerouslySetInnerHTML`. Los emojis decorativos ahí (📄, 🔹, 🚨, etc.) son
contenido editorial, no iconos de UI, y quedan fuera de esta regla salvo que
se pida explícitamente migrarlos.

**Al tocar código existente:** si ves un emoji usado como icono en un
archivo `.jsx` que estás editando (fuera de la excepción anterior),
reemplázalo por el icono de lucide-react más cercano en significado.
