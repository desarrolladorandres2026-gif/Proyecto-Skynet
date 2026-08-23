import { describe, expect, it } from 'vitest'
import { detectarIntencion } from '../src/modules/copiloto/copiloto.intencion.js'
import { normalizar, tokenizar, coincide, distancia } from '../src/modules/copiloto/copiloto.texto.js'

// El router de intención es la pieza que decide qué NO pasa por el modelo, así
// que sus fallos son silenciosos: un falso positivo contesta con una plantilla
// equivocada y nadie se entera. Estos tests fijan sobre todo los DESCARTES.

describe('normalizar / tokenizar', () => {
  it('colapsa tildes, signos de apertura y espacios', () => {
    expect(normalizar('  ¿Cómo  van   MIS Requerimientos? ')).toBe('como van mis requerimientos')
  })

  it('normaliza la ñ igual en los dos lados de la comparación', () => {
    expect(normalizar('daño')).toBe(normalizar('DAÑO'))
    expect(normalizar('daño')).toBe('dano')
  })

  it('quita muletillas colombianas y el nombre del asistente', () => {
    expect(tokenizar('oiga parce muéstreme pues mis requerimientos porfa')).toEqual([
      'muestreme',
      'requerimientos',
    ])
    expect(tokenizar('skynet mis vacaciones')).toEqual(['vacaciones'])
  })
})

describe('tolerancia a errores de escritura y transcripción', () => {
  it('acepta una transposición en una palabra larga', () => {
    expect(detectarIntencion('mis requerimeintos')).toMatchObject({ nombre: 'mis_requerimientos' })
  })

  it('acepta una palabra cortada por el transcriptor', () => {
    expect(detectarIntencion('mis requerimien')).toMatchObject({ nombre: 'mis_requerimientos' })
  })

  it('NO confunde "datos" con "danos" — la colisión que motiva el corte en 5 letras', () => {
    expect(coincide('datos', ['danos'])).toBe(false)
    expect(distancia('datos', 'danos')).toBe(1)
  })
})

describe('atajos de consulta', () => {
  it('enruta las listas de cada módulo', () => {
    expect(detectarIntencion('mis vacaciones')).toMatchObject({ nombre: 'mis_ausencias' })
    expect(detectarIntencion('que daños reporté')).toMatchObject({ nombre: 'mis_reportes_dano' })
    expect(detectarIntencion('qué tengo pendiente')).toMatchObject({ nombre: 'resumen_dashboard' })
  })

  it('extrae el estado cuando la persona lo nombra', () => {
    expect(detectarIntencion('mis requerimientos rechazados')).toMatchObject({
      nombre: 'mis_requerimientos',
      args: { estado: 'rechazado' },
    })
    expect(detectarIntencion('vacaciones aprobadas')).toMatchObject({
      nombre: 'mis_ausencias',
      args: { estado: 'aprobada' },
    })
  })

  it('resuelve "cómo van mis requerimientos", la pregunta más frecuente del sistema', () => {
    // Regresión: cuando "como" estaba suelto en la lista de razonamiento, esta
    // frase —la canónica de todo el módulo— se descartaba al modelo.
    expect(detectarIntencion('cómo van mis requerimientos')).toMatchObject({ nombre: 'mis_requerimientos' })
    expect(detectarIntencion('cómo va mi vacación')).toMatchObject({ nombre: 'mis_ausencias' })
  })

  it('distingue el sustantivo "reporte" del verbo "reportar"', () => {
    // Regresión: "reporte" está a 1 edición de "reporta", así que el descarte
    // difuso se comía esta consulta.
    expect(detectarIntencion('mis reportes de daño')).toMatchObject({ nombre: 'mis_reportes_dano' })
    expect(detectarIntencion('quiero reportar un daño')).toBeNull()
  })

  it('prefiere la lista concreta sobre el resumen genérico', () => {
    // "pendientes" también es señal de resumen_dashboard; gana el objeto
    // específico porque es lo que la persona nombró.
    expect(detectarIntencion('mis requerimientos pendientes')).toMatchObject({
      nombre: 'mis_requerimientos',
      args: { estado: 'pendiente_financiero' },
    })
  })

  it('resuelve el clima con y sin ciudad', () => {
    expect(detectarIntencion('qué clima hace')).toMatchObject({ nombre: 'clima', args: { ciudad: 'Neiva' } })
    expect(detectarIntencion('clima en bogota')).toMatchObject({ nombre: 'clima', args: { ciudad: 'bogota' } })
    // "de hoy" es un adverbio de tiempo, no una ciudad.
    expect(detectarIntencion('el clima de hoy')).toMatchObject({ nombre: 'clima', args: { ciudad: 'Neiva' } })
  })

  it('resuelve la hora, con y sin lugar', () => {
    expect(detectarIntencion('qué hora es')).toMatchObject({ nombre: 'hora' })
    expect(detectarIntencion('qué hora es ahora')).toMatchObject({ nombre: 'hora' })
    expect(detectarIntencion('qué hora es en madrid')).toMatchObject({
      nombre: 'hora',
      args: { lugar: 'madrid' },
    })
  })

  it('"Nueva York" cae al modelo, y está bien que así sea', () => {
    // 'nueva' está en VERBOS_ESCRITURA (por "nueva solicitud", "nuevo
    // requerimiento"), así que el descarte por verbo de escritura se dispara.
    // Es un falso negativo conocido y se deja a propósito: relajar ese
    // descarte para ganar 800 ms en una ciudad abriría la puerta a que "quiero
    // una nueva vacación" tomara un atajo de consulta. El modelo tiene la
    // herramienta hora_actual declarada y responde bien igual.
    expect(detectarIntencion('qué hora es en nueva york')).toBeNull()
  })

  it('los verbos de navegación descartan el atajo', () => {
    // "abre el panel" pide IR al panel, no que le lean el resumen. Sin este
    // descarte tomaba el atajo de resumen_dashboard y el usuario recibía un
    // texto en vez de la pantalla que pidió.
    expect(detectarIntencion('abre el panel')).toBeNull()
    expect(detectarIntencion('llevame a mis vacaciones')).toBeNull()
    expect(detectarIntencion('entra a requerimientos')).toBeNull()
  })

  it('"muéstrame" sigue siendo consulta, no navegación', () => {
    // Es ambiguo y se usa mucho más como consulta. Meterlo en el descarte
    // costaría el atajo de la pregunta más frecuente del sistema.
    expect(detectarIntencion('muestrame mis requerimientos')).toMatchObject({
      nombre: 'mis_requerimientos',
    })
  })

  it('resuelve la fecha', () => {
    expect(detectarIntencion('qué día es hoy')).toMatchObject({ nombre: 'fecha' })
    expect(detectarIntencion('qué fecha es')).toMatchObject({ nombre: 'fecha' })
  })

  it('el clima gana sobre la fecha cuando la frase menciona "hoy"', () => {
    // El orden de las reglas es lo que decide esto: 'hoy' es marcador de
    // fecha, pero el vocabulario de clima es más específico y debe ganar. Al
    // revés, toda pregunta meteorológica con "hoy" respondería la fecha.
    expect(detectarIntencion('qué clima hace hoy')).toMatchObject({ nombre: 'clima' })
    expect(detectarIntencion('va a llover hoy')).toMatchObject({ nombre: 'clima' })
  })
})

describe('cortesía', () => {
  it('resuelve saludos y agradecimientos sueltos con plantilla', () => {
    expect(detectarIntencion('hola')).toMatchObject({ nombre: 'saludo' })
    expect(detectarIntencion('buenas')).toMatchObject({ nombre: 'saludo' })
    expect(detectarIntencion('gracias')).toMatchObject({ nombre: 'agradecimiento' })
    expect(detectarIntencion('chao')).toMatchObject({ nombre: 'despedida' })
  })

  it('NO trata como saludo una consulta que empieza saludando', () => {
    expect(detectarIntencion('hola cuántos requerimientos tengo')).not.toMatchObject({ nombre: 'saludo' })
  })
})

describe('descartes — todo esto debe caer al modelo (null)', () => {
  it('descarta cualquier verbo de escritura', () => {
    expect(detectarIntencion('quiero pedir un requerimiento')).toBeNull()
    expect(detectarIntencion('necesito comprar 5 llantas')).toBeNull()
    expect(detectarIntencion('cancela mis vacaciones')).toBeNull()
    expect(detectarIntencion('reportar un daño')).toBeNull()
  })

  it('descarta las preguntas que piden explicación, no un dato', () => {
    expect(detectarIntencion('por qué me rechazaron el requerimiento')).toBeNull()
    expect(detectarIntencion('explícame el flujo de ausencias')).toBeNull()
  })

  it('descarta frases largas, que casi siempre traen un matiz', () => {
    expect(
      detectarIntencion('mis requerimientos de la semana pasada que iban para bodega pero se devolvieron')
    ).toBeNull()
  })

  it('descarta lo que no reconoce, en vez de adivinar', () => {
    expect(detectarIntencion('quién ganó el partido')).toBeNull()
    expect(detectarIntencion('abre las cámaras del terminal')).toBeNull()
  })

  it('descarta las órdenes del protocolo de despliegue', () => {
    // Deben llegar al modelo para que las resuelva vía herramienta: si un
    // atajo las capturara, resolverAtajo() llamaría ejecutar() DIRECTAMENTE,
    // sin mirar requiereConfirmacion — saltándose la confirmación del envío
    // oficial por completo. Este test fija esa frontera.
    expect(detectarIntencion('inicia protocolo de despliegue')).toBeNull()
    expect(detectarIntencion('asistente inicia protocolo de despliegue')).toBeNull()
    expect(detectarIntencion('ejecuta prueba de comunicaciones')).toBeNull()
    expect(detectarIntencion('asistente ejecuta prueba de comunicaciones')).toBeNull()
  })
})
