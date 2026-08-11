import { useEffect, useState } from 'react'

// En móviles, al enfocar un input el teclado no reduce `window.innerHeight`:
// reduce el "visual viewport" (lo que realmente se ve), mientras el layout
// viewport sigue del mismo alto. Por eso un elemento `fixed` que solo mira
// `innerHeight`/CSS normal termina tapado o cortado por el teclado — nunca
// se entera de que el teclado apareció. `visualViewport` es la única API que
// sí lo sabe, así que este hook mide la diferencia entre ambos altos.
export function useTecladoVirtual() {
  const [alturaTeclado, setAlturaTeclado] = useState(0)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const actualizar = () => {
      const diferencia = window.innerHeight - vv.height - vv.offsetTop
      setAlturaTeclado(diferencia > 60 ? diferencia : 0)
    }

    actualizar()
    vv.addEventListener('resize', actualizar)
    vv.addEventListener('scroll', actualizar)
    return () => {
      vv.removeEventListener('resize', actualizar)
      vv.removeEventListener('scroll', actualizar)
    }
  }, [])

  return alturaTeclado
}
