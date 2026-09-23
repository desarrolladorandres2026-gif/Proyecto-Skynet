import { useEffect, useState } from 'react'

// Devuelve `valor` con un retraso: solo cambia cuando deja de cambiar durante
// `ms`. Sirve para no disparar una petición por cada tecla de un buscador.
export function useValorDiferido(valor, ms = 350) {
  const [diferido, setDiferido] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setDiferido(valor), ms)
    return () => clearTimeout(t)
  }, [valor, ms])
  return diferido
}
