# Temáticas del sistema

Ambientación estacional (Navidad, etc.) aislada en este módulo. Las pantallas
solo usan `Tematica*` de `tematicas/index.js`; no saben cuál temática hay.

## Quién la elige
Es **global**: un administrador (permiso `tematica:gestionar`, o Super Admin)
la elige en **Sistema → Temática del sistema** y se guarda en el backend
(`/tematica`, modelo `ConfiguracionTematica`). Todos los usuarios ven la misma;
les llega al abrir la app o al volver a enfocar la pestaña.

Opciones: **Automática** (la temática cuya temporada esté vigente hoy, o
ninguna), una temática concreta (se muestra siempre, sin importar la fecha) o
**Sin temática**.

## Quitar todo de golpe
- Normal: Sistema → Temática → **Sin temática**.
- Desde código: `config.js` → `TEMATICAS_ACTIVAS = false` (ignora el servidor).

## Agregar una temática (solo datos)
1. Crea `tematicas/<id>/index.js` y exporta la definición:

```js
export default {
  id: 'san-pedro',                                  // slug: a-z, 0-9, guiones
  nombre: 'San Pedro',
  emoji: '💃',
  temporada: { desde: [6, 15], hasta: [7, 5] },     // [mes, día]; puede cruzar año
  luces: { colores: ['#facc15', '#ef4444'], borde: '#a16207' },   // opcional
  adorno: { izq: [{ emoji: '🤠', animacion: 'saludo' }],          // opcional
            der: [{ emoji: '🎺' }, { emoji: '💃', animacion: 'salto' }] },
  gorroEmoji: '🎉',                                 // detalle en botones de acceso rápido
  escena: { fondo: 'linear-gradient(...)', titulo: '¡Viva San Pedro!', subtitulo, firma,
            colorTitulo: '#fff7ed', particulas: ['🎊'], desfile: ['💃', '🎺'] },
  ticker: ['Frase 1', 'Frase 2'],
}
```
2. Regístrala en `registro.js` (`TEMATICAS = [navidad, sanPedro]`).
3. Aparece sola en Sistema → Temática.

Todo campo es opcional: sin `luces` no hay guirnalda, sin `ticker` no hay
frases, etc.

## Algo más elaborado
Una temática puede traer componentes propios en vez de datos, como Navidad:
`Escena` (escena de Inicio) y `Gorro` (detalle sobre botones). Pon su CSS en la
carpeta de la temática y prefija las clases (`navidad-…`) para no chocar.

## Quitar una temática
Borra su línea en `registro.js` (y su carpeta). Si estaba elegida, el sistema
vuelve a Automática.
