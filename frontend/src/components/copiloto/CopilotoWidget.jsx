import { useState } from 'react'
import { motion } from 'framer-motion'

import { useAuth } from '../../auth/AuthContext.jsx'
import { copiloto } from '../../api/copiloto.js'
import { CopilotoButton } from './CopilotoButton.jsx'
import { CopilotoChatCard } from './CopilotoChatCard.jsx'

// Burbuja flotante y movible disponible en cualquier pantalla (montada una sola vez en AppShell.jsx).
// Permite arrastrar el botón a cualquier posición de la pantalla (mouse + touch).
export default function CopilotoWidget() {
  const { moduloActivo } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const [mensajes, setMensajes] = useState([])
  const [entrada, setEntrada] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  if (!moduloActivo('copiloto')) return null

  async function enviar(e) {
    e?.preventDefault?.()
    const texto = entrada.trim()
    if (!texto || cargando) return

    const historialPrevio = mensajes
    setEntrada('')
    setError('')
    // El turno del usuario + un turno vacío del modelo que se va rellenando
    // con cada trozo que llega (efecto "escribiendo"). `streaming` marca cuál
    // es la burbuja en curso para que la UI no muestre además el indicador de
    // "Pensando…" cuando el texto ya empezó a aparecer.
    setMensajes([...historialPrevio, { rol: 'user', texto }, { rol: 'model', texto: '', streaming: true }])
    setCargando(true)
    try {
      const resultado = await copiloto.chat(texto, historialPrevio, {
        onDelta: (trozo) =>
          setMensajes((prev) => {
            const copia = [...prev]
            const ultimo = copia[copia.length - 1]
            copia[copia.length - 1] = { ...ultimo, texto: ultimo.texto + trozo }
            return copia
          }),
      })
      // El historial del backend es la fuente de verdad (ya viene recortado y
      // sin la marca `streaming`).
      setMensajes(resultado.historial)
    } catch (err) {
      // Descarta la burbuja vacía del modelo: el error se muestra en su banner.
      setMensajes([...historialPrevio, { rol: 'user', texto }])
      setError(err.message || 'No se pudo consultar a Skynet')
    } finally {
      setCargando(false)
    }
  }

  const limpiarHistorial = () => {
    setMensajes([])
    setError('')
  }

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0.05}
      className="fixed right-4 bottom-20 z-40 sm:right-6 sm:bottom-6 touch-none"
    >
      <CopilotoChatCard
        isOpen={abierto}
        onClose={() => setAbierto(false)}
        mensajes={mensajes}
        entrada={entrada}
        setEntrada={setEntrada}
        onEnviar={enviar}
        cargando={cargando}
        error={error}
        onLimpiarHistorial={limpiarHistorial}
      />

      <div className="flex justify-end">
        <CopilotoButton
          isOpen={abierto}
          onClick={() => setAbierto((v) => !v)}
          badgeText="Skynet • Arrastra para mover"
          size={70}
        />
      </div>
    </motion.div>
  )
}
