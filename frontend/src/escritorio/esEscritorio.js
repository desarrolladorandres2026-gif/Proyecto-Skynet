// Detección del modo escritorio.
//
// El panel de Skynet es EL MISMO código en el navegador y dentro del asistente
// de escritorio: la app de Electron carga esta misma web desde la misma URL.
// Lo único que cambia es que allí existe `window.skynetEscritorio`, que publica
// el preload (ver escritorio/src/preload.js).
//
// Se comprueba la existencia del puente y no el user-agent: el user-agent de
// Electron se puede falsear y además cambia entre versiones, mientras que el
// puente o está o no está. Si no está, todo el código de escritorio queda
// inerte y la web se comporta exactamente como siempre.

/** @returns {boolean} true si corremos dentro del asistente de escritorio. */
export function esEscritorio() {
  return typeof window !== 'undefined' && typeof window.skynetEscritorio?.version === 'number'
}

/**
 * El puente, o un objeto inerte con la misma forma.
 *
 * Devolver un doble sin operaciones en vez de `null` evita sembrar el resto
 * del código de `if (puente)`: quien lo use puede llamar a sus métodos siempre,
 * y en el navegador simplemente no hacen nada. Las funciones de suscripción
 * devuelven una función de baja vacía para que el cleanup de los efectos de
 * React funcione igual por los dos caminos.
 */
export function puenteEscritorio() {
  if (esEscritorio()) return window.skynetEscritorio
  return {
    version: 0,
    atajo: null,
    wakeWordInicial: false,
    hayModelo: false,
    alEscuchar: () => () => {},
    alCambiarWakeWord: () => () => {},
    reportarEstado: () => {},
    abrirPanel: () => {},
    sesionCaducada: () => {},
    diagnostico: async () => null,
    urlModelo: () => null,
  }
}
