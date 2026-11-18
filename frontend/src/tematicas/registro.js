// Registro de temáticas disponibles.
//
// Para AGREGAR una: crea una carpeta con un index.js que exporte su
// definición (ver tematicas/README.md) e impórtala aquí.
// Para RETIRAR una: quita su línea; si estaba elegida, el sistema vuelve a
// 'auto' (la temática de la temporada vigente, o ninguna).
//
// Si dos temporadas se solapan en 'auto', gana la primera de esta lista.
import navidad from './navidad/index.js'

export const TEMATICAS = [navidad]
