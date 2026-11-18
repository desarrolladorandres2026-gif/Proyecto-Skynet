import { NavidadGorro, NavidadViaje } from './Escena.jsx'
import { NavidadLateralFondo, NavidadLateralPie } from './Lateral.jsx'
import { NavidadLoginFondo, NavidadLoginHero, NavidadLoginPie } from './Login.jsx'
import { NavidadMovilFondo, NavidadMovilPie } from './Movil.jsx'

// Temporada navideña: 15 nov – 6 ene.
export default {
  id: 'navidad',
  nombre: 'Navidad',
  emoji: '🎄',
  temporada: { desde: [11, 15], hasta: [1, 6] },

  // Guirnalda de bombillos en el borde superior de la pantalla.
  luces: { colores: ['#ef4444', '#22c55e', '#facc15', '#60a5fa'], borde: '#166534' },

  // Adornos en la barra superior (izquierda y derecha).
  adorno: {
    izq: [{ emoji: '🎅', animacion: 'saludo' }],
    der: [{ emoji: '🎄' }, { emoji: '🎁', animacion: 'salto' }],
  },

  // Gorrito sobre los botones de acceso rápido (componente propio).
  Gorro: NavidadGorro,

  // Escena animada del Inicio (componente propio, lleva su aria-label).
  Escena: NavidadViaje,

  // Barra lateral: capa de fondo (nieve y luces) y pie (paisaje), componentes propios.
  LateralFondo: NavidadLateralFondo,
  LateralPie: NavidadLateralPie,

  // Pantalla de login: nieve a pantalla completa, saludo + trineo sobre la foto
  // y paisaje al pie del formulario (componentes propios).
  LoginFondo: NavidadLoginFondo,
  LoginHero: NavidadLoginHero,
  LoginPie: NavidadLoginPie,

  // Teléfono (MobileShell): nieve ligera sobre toda la app y nieve acumulada
  // sobre la barra inferior (componentes propios).
  MovilFondo: NavidadMovilFondo,
  MovilPie: NavidadMovilPie,

  // Sonido al iniciar sesión: "Jingle Bells" alegre y rápido, con cascabeles
  // de trineo y la melodía doblada una octava abajo. ~8 s.
  sonidoLogin: {
    tempo: 250,
    doblarOctava: true,
    cascabeles: true,
    notas: [
      ['E5', 1], ['E5', 1], ['E5', 2],
      ['E5', 1], ['E5', 1], ['E5', 2],
      ['E5', 1], ['G5', 1], ['C5', 1.5], ['D5', 0.5],
      ['E5', 4],
      ['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', 0.5],
      ['F5', 1], ['E5', 1], ['E5', 1], ['E5', 0.5], ['E5', 0.5],
      ['E5', 1], ['D5', 1], ['D5', 1], ['E5', 1],
      ['D5', 2], ['G5', 2],
      // remate festivo
      ['C5', 0.5], ['E5', 0.5], ['G5', 0.5], ['C6', 0.5], ['G5', 0.5], ['E5', 0.5], ['G5', 0.5], ['C6', 3],
    ],
  },

  // Frases que rotan en la barra superior.
  ticker: [
    '🎄 ¡La Terminal de Transportes de Neiva les desea una Feliz Navidad!',
    '✨ ¡Que la magia de la Navidad ilumine cada hogar!',
    '🎁 ¡Felices fiestas y un próspero Año Nuevo 2027!',
    '❤️ ¡Esta Navidad, el mejor destino es la familia!',
    '🎄 ¡Que la paz, el amor y la alegría acompañen cada viaje!',
    '✨ ¡En Navidad conectamos destinos y unimos corazones!',
    '🎅 ¡La Terminal de Transportes de Neiva les desea felices fiestas!',
    '🌟 ¡Que el 2027 esté lleno de nuevos caminos y oportunidades!',
    '🎁 ¡Gracias por viajar con nosotros este año!',
    '❤️ ¡Que cada viaje termine en un abrazo esta Navidad!',
    '🎄 ¡La Navidad es tiempo de compartir y reencontrarnos!',
    '✨ ¡Juntos seguimos recorriendo caminos de esperanza!',
  ],
}
