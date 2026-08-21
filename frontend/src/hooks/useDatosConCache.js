import { useState, useEffect, useCallback, useRef } from 'react'

// Caché en memoria compartida entre montajes de componentes: vive mientras la
// pestaña esté abierta (se pierde al recargar el navegador, que es lo
// correcto). Al navegar fuera de una página React la desmonta y al volver la
// vuelve a montar desde cero — sin esto, cada ida y vuelta a /danos o /
// disparaba otra vez todas las peticiones aunque los datos siguieran frescos.
const cache = new Map()

// Peticiones en vuelo por clave: si dos componentes (o un StrictMode que
// monta dos veces en dev) piden la misma clave al mismo tiempo, comparten la
// misma promesa en vez de disparar dos peticiones idénticas al backend.
const enVuelo = new Map()

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

  // Si `clave` cambia (ej. cambia un filtro o la página) antes de que una
  // petición vieja termine, esa respuesta tardía ya no debe pisar el estado
  // del filtro/página nuevo — sin este guard, navegar rápido entre meses o
  // páginas podía mostrar datos de la selección anterior.
  const claveVigenteRef = useRef(clave)
  claveVigenteRef.current = clave

  // `silencioso` es para refrescos de fondo (ver useAutoRefresh en las
  // páginas que ya lo usaban): no toca el error visible si la petición
  // falla, para no mostrar un banner de error solo porque un tick de fondo
  // tuvo un hipo de red — se reintenta solo en el próximo tick.
  const cargar = useCallback((forzar = false, silencioso = false) => {
    const actual = cache.get(clave)
    const fresco = actual && Date.now() - actual.timestamp < ttlMs
    if (fresco && !forzar) {
      setData(actual.data)
      setCargando(false)
      setError('')
      return Promise.resolve(actual.data)
    }
    if (!actual) setCargando(true)

    const promesaCompartida = enVuelo.get(clave) || fetchFnRef.current()
      .then((res) => {
        cache.set(clave, { data: res, timestamp: Date.now() })
        return res
      })
      .finally(() => enVuelo.delete(clave))
    enVuelo.set(clave, promesaCompartida)

    return promesaCompartida
      .then((res) => {
        if (claveVigenteRef.current === clave) {
          setData(res)
          if (!silencioso) setError('')
        }
        return res
      })
      .catch((err) => {
        if (claveVigenteRef.current === clave && !silencioso) setError(err.message)
        throw err
      })
      .finally(() => {
        if (claveVigenteRef.current === clave) setCargando(false)
      })
  }, [clave, ttlMs])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Para mutaciones (crear/editar/eliminar/asignar): actualiza el dato ya
  // mostrado Y la entrada compartida de caché al mismo tiempo, sin volver a
  // pedirle nada al backend. Acepta un valor o, como setState, una función
  // (dato_anterior) => dato_nuevo.
  const actualizarLocal = useCallback((actualizador) => {
    setData((anterior) => {
      const nuevo = typeof actualizador === 'function' ? actualizador(anterior) : actualizador
      cache.set(clave, { data: nuevo, timestamp: Date.now() })
      return nuevo
    })
  }, [clave])

  return {
    data,
    cargando,
    error,
    recargar: () => cargar(true),
    recargarSilencioso: () => cargar(true, true).catch(() => {}),
    actualizarLocal,
  }
}
