import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// En desarrollo, desregistra service workers de proyectos/builds anteriores
// servidos en este mismo origen (p. ej. el SW de un proyecto legado en
// :5173), que de lo contrario interceptan los fetch y dejan la app colgada.
// En producción no corre: allí la PWA registra su propio SW.
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    if (regs.length === 0) return
    Promise.all(regs.map((reg) => reg.unregister())).then(() => {
      // El SW viejo controla la página hasta recargar: recarga una sola vez.
      if (navigator.serviceWorker.controller) window.location.reload()
    })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
