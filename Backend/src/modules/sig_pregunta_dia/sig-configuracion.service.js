import ConfiguracionSig from '../../models/ConfiguracionSig.js'
import PreguntaSig from '../../models/PreguntaSig.js'
import { ErrorValidacion } from '../../utils/errores.js'
import { auditar, obtenerOCrearConfiguracion, obtenerConfiguracionCacheada, invalidarCacheConfiguracion } from './comun.js'

export async function obtenerConfiguracion() {
  return obtenerConfiguracionCacheada()
}

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/

function validarComponentes(componentes) {
  if (!Array.isArray(componentes) || !componentes.length) {
    throw new ErrorValidacion('Debes configurar al menos un componente SIG')
  }
  const limpios = componentes.map((c) => c.trim()).filter(Boolean)
  if (new Set(limpios).size !== limpios.length) {
    throw new ErrorValidacion('No puede haber componentes SIG repetidos')
  }
  return limpios
}

// Los umbrales deben cubrir 0-100 sin huecos: ordenados por `orden`, cada
// umbralMinimo debe ser estrictamente menor que el anterior, y el último
// nivel (el más bajo) debe llegar hasta 0 — así calcularNivel() (comun.js)
// siempre encuentra un nivel para cualquier porcentaje entre 0 y 100.
function validarNiveles(niveles) {
  if (!Array.isArray(niveles) || niveles.length < 1) {
    throw new ErrorValidacion('Debes configurar al menos un nivel de desempeño')
  }
  const ordenados = [...niveles].sort((a, b) => a.orden - b.orden)
  for (let i = 0; i < ordenados.length; i++) {
    const n = ordenados[i]
    if (!n.clave?.trim() || !n.nombre?.trim()) {
      throw new ErrorValidacion('Cada nivel necesita clave y nombre')
    }
    if (typeof n.umbralMinimo !== 'number' || n.umbralMinimo < 0 || n.umbralMinimo > 100) {
      throw new ErrorValidacion(`El umbral de "${n.nombre}" debe estar entre 0 y 100`)
    }
    if (i > 0 && n.umbralMinimo >= ordenados[i - 1].umbralMinimo) {
      throw new ErrorValidacion('Los umbrales deben ser estrictamente descendentes según el orden de los niveles')
    }
  }
  if (ordenados[ordenados.length - 1].umbralMinimo !== 0) {
    throw new ErrorValidacion('El nivel más bajo debe tener umbral 0, para cubrir cualquier porcentaje')
  }
  const claves = ordenados.map((n) => n.clave.trim())
  if (new Set(claves).size !== claves.length) {
    throw new ErrorValidacion('Las claves de los niveles no pueden repetirse')
  }
  return ordenados
}

export async function actualizarConfiguracion(datos, usuarioActor) {
  const config = await obtenerOCrearConfiguracion()
  const antes = config.toObject()

  if (datos.horaPublicacionDefecto !== undefined) {
    if (!HORA_RE.test(datos.horaPublicacionDefecto)) {
      throw new ErrorValidacion('La hora de publicación debe tener formato HH:mm')
    }
    config.horaPublicacionDefecto = datos.horaPublicacionDefecto
  }

  if (datos.componentes !== undefined) {
    const limpios = validarComponentes(datos.componentes)
    // No se puede retirar un componente que el banco ya está usando: dejaría
    // preguntas existentes con un componenteSig que ya no aparece en ningún
    // filtro/formulario.
    const enUso = await PreguntaSig.distinct('componenteSig')
    const perdidos = enUso.filter((c) => !limpios.includes(c))
    if (perdidos.length) {
      throw new ErrorValidacion(`No puedes quitar "${perdidos[0]}": hay preguntas del banco que lo usan`)
    }
    config.componentes = limpios
  }

  if (datos.nivelesDesempeno !== undefined) {
    config.nivelesDesempeno = validarNiveles(datos.nivelesDesempeno)
  }

  if (datos.ventanaDesempenoDias !== undefined) {
    const v = datos.ventanaDesempenoDias
    if (v !== null && (typeof v !== 'number' || v <= 0)) {
      throw new ErrorValidacion('La ventana de desempeño debe ser un número de días positivo, o vacía para histórico completo')
    }
    config.ventanaDesempenoDias = v
  }

  if (datos.notificarAlPublicar !== undefined) {
    config.notificarAlPublicar = Boolean(datos.notificarAlPublicar)
  }

  config.actualizadoPor = usuarioActor.id_usuario
  await config.save()
  invalidarCacheConfiguracion()

  await auditar(usuarioActor, 'configurar', 'ConfiguracionSig', config._id, 'Actualizó la configuración del módulo SIG', {
    antes,
    despues: config.toObject(),
  })

  return config
}
