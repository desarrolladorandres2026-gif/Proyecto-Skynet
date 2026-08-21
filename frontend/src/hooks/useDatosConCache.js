import { useState, useEffect, useCallback, useRef } from 'react'

// Caché en memoria compartida entre montajes de componentes: vive mientras la
// pestaña esté abierta (se pierde al recargar el navegador, que es lo
// correcto). Al navegar fuera de una página React la desmonta y al volver la
// vuelve a montar desde cero — sin esto, cada ida y vuelta a /danos o /
// disparaba otra vez todas las peticiones aunque los datos siguieran frescos.
const cache = new Map()

export function invalidarCache(clave) {
  cache.delete(clave)
}

export function invalidarCachePorPrefijo(prefijo) {
  for (const clave of cache.keys()) {
    if (clave.startsWith(prefijo)) cache.delete(clave)
  }
}

// Stale-while-revalidate simple: si hay datos en caché más frescos que ttlMs,
// se usan de inmediato (sin spinner, sin petición). Si están vencidos o no
// existen, se pide al backend y se guarda el resultado con su hora.
export function useDatosConCache(clave, fetchFn, { ttlMs = 60_000 } = {}) {
  const enCache = cache.get(clave)
  const [data, setData] = useState(enCache?.data ?? null)
  const [cargando, setCargando] = useState(!enCache)
  const [error, setError] = useState('')
  const fetchFnRef = useRef(fetchFn)
  fetchFnRef.current = fetchFn

  const cargar = useCallback((forzar = false) => {
    const actual = cache.get(clave)
    const fresco = actual && Date.now() - actual.timestamp < ttlMs
    if (fresco && !forzar) {
      setData(actual.data)
      setCargando(false)
      setError('')
      return Promise.resolve(actual.data)
    }
    if (!actual) setCargando(true)
    return fetchFnRef.current()
      .then((res) => {
        cache.set(clave, { data: res, timestamp: Date.now() })
        setData(res)
        setError('')
        return res
      })
      .catch((err) => {
        setError(err.message)
        throw err
      })
      .finally(() => setCargando(false))
  }, [clave, ttlMs])

  useEffect(() => {
    cargar()
  }, [cargar])

  return { data, cargando, error, recargar: () => cargar(true) }
}
