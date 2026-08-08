import mongoose from 'mongoose'
import { describe, expect, it } from 'vitest'
import {
  abrirConversacion,
  registrarIntercambio,
  turnosParaContexto,
  recordarHecho,
  olvidarHecho,
  obtenerHechos,
  sanearTexto,
} from '../src/modules/copiloto/copiloto.memoria.js'
import { instruccionSistema, PROMPT_BASE } from '../src/modules/copiloto/copiloto.prompt.js'
import ConversacionCopiloto from '../src/models/ConversacionCopiloto.js'

function usuarioFalso(nombre = 'Ana') {
  return {
    id_usuario: new mongoose.Types.ObjectId(),
    nombre_usuario: nombre,
    rol: { nombre: 'Bodega', slug: 'bodega' },
  }
}

// Espera a que se aplique la escritura que registrarIntercambio lanza sin
// await (es deliberado: no hace esperar al usuario por la persistencia).
const dejarPersistir = () => new Promise((r) => setTimeout(r, 30))

describe('sanearTexto', () => {
  it('quita caracteres de control, que son el vehículo para esconder instrucciones', () => {
    // Construido con fromCharCode y no con los caracteres literales: pegarlos
    // crudos vuelven el archivo binario para Git e ilegible en el editor.
    const conControles = 'hola' + String.fromCharCode(0) + String.fromCharCode(7) + ' mundo'
    expect(sanearTexto(conControles)).toBe('hola mundo')
  })

  it('recorta al techo para que un mensaje enorme no agote la cuota compartida', () => {
    const largo = 'a'.repeat(5000)
    expect(sanearTexto(largo, 100)).toHaveLength(101) // 100 + el carácter de elisión
  })

  it('tolera lo que no es texto sin reventar', () => {
    expect(sanearTexto(null)).toBe('')
    expect(sanearTexto({ inyeccion: true })).toBe('')
  })
})

describe('aislamiento entre usuarios', () => {
  it('NO devuelve la conversación de otra persona aunque manden su id', async () => {
    const ana = usuarioFalso('Ana')
    const beto = usuarioFalso('Beto')

    const deAna = await abrirConversacion(null, ana)
    registrarIntercambio(deAna, { pregunta: 'mi salario', respuesta: 'dato confidencial de Ana' })
    await dejarPersistir()

    // Beto manda el id de Ana: es el IDOR clásico. Debe recibir un hilo nuevo
    // y vacío, nunca el de ella.
    const robado = await abrirConversacion(deAna.id, beto)
    expect(robado.id).not.toBe(deAna.id)
    expect(robado.turnos).toEqual([])
  })

  it('abre un hilo nuevo si el id es inservible, en vez de fallar', async () => {
    const ana = usuarioFalso()
    for (const idMalo of ['no-es-un-objectid', '', new mongoose.Types.ObjectId().toString()]) {
      const conv = await abrirConversacion(idMalo, ana)
      expect(conv.turnos).toEqual([])
      expect(mongoose.isValidObjectId(conv.id)).toBe(true)
    }
  })
})

describe('memoria corta (conversación)', () => {
  it('acumula los turnos y los persiste', async () => {
    const ana = usuarioFalso()
    const conv = await abrirConversacion(null, ana)
    registrarIntercambio(conv, { pregunta: '¿cuántos tengo?', respuesta: 'Tienes 3.' })
    await dejarPersistir()

    const enBase = await ConversacionCopiloto.findById(conv.id).lean()
    expect(enBase.turnos).toHaveLength(2)
    expect(enBase.turnos[0]).toMatchObject({ rol: 'user', texto: '¿cuántos tengo?' })
    expect(enBase.turnos[1]).toMatchObject({ rol: 'model', texto: 'Tienes 3.' })
  })

  it('manda al modelo solo los últimos turnos, no la conversación entera', async () => {
    const ana = usuarioFalso()
    const conv = await abrirConversacion(null, ana)
    for (let i = 0; i < 10; i++) {
      registrarIntercambio(conv, { pregunta: `pregunta ${i}`, respuesta: `respuesta ${i}` })
    }
    const contexto = turnosParaContexto(conv)
    expect(contexto).toHaveLength(8)
    // Los 8 últimos son los 4 intercambios más recientes.
    expect(contexto[0].texto).toBe('pregunta 6')
    expect(contexto.at(-1).texto).toBe('respuesta 9')
  })

  it('registra los temas sin repetirlos', async () => {
    const ana = usuarioFalso()
    const conv = await abrirConversacion(null, ana)
    registrarIntercambio(conv, { pregunta: 'a', respuesta: 'b', tema: 'mis_requerimientos' })
    registrarIntercambio(conv, { pregunta: 'c', respuesta: 'd', tema: 'mis_requerimientos' })
    registrarIntercambio(conv, { pregunta: 'e', respuesta: 'f', tema: 'clima' })
    expect(conv.temas).toEqual(['mis_requerimientos', 'clima'])
  })
})

describe('memoria larga (hechos)', () => {
  it('guarda, lista y borra', async () => {
    const ana = usuarioFalso()
    await recordarHecho(ana.id_usuario, 'Area habitual', 'Bodega')
    expect(await obtenerHechos(ana.id_usuario)).toMatchObject([{ clave: 'area habitual', valor: 'Bodega' }])

    await olvidarHecho(ana.id_usuario, 'area habitual')
    expect(await obtenerHechos(ana.id_usuario)).toEqual([])
  })

  it('reemplaza por clave en vez de acumular versiones contradictorias', async () => {
    const ana = usuarioFalso()
    await recordarHecho(ana.id_usuario, 'area habitual', 'Mantenimiento')
    await recordarHecho(ana.id_usuario, 'area habitual', 'Bodega')
    const hechos = await obtenerHechos(ana.id_usuario)
    expect(hechos).toHaveLength(1)
    expect(hechos[0].valor).toBe('Bodega')
  })

  it('rechaza un hecho sin clave o sin valor', async () => {
    const ana = usuarioFalso()
    expect(await recordarHecho(ana.id_usuario, '', 'algo')).toMatchObject({ guardado: false })
    expect(await obtenerHechos(ana.id_usuario)).toEqual([])
  })
})

describe('instruccionSistema', () => {
  it('incluye la fecha de hoy, sin la cual el modelo no resuelve "esta semana"', () => {
    const prompt = instruccionSistema(usuarioFalso('Ana'), [], [])
    expect(prompt).toContain('Hoy es')
    expect(prompt).toContain('Ana')
    expect(prompt).toContain('Bodega')
  })

  it('solo agrega las capas que tienen contenido', () => {
    const vacio = instruccionSistema(usuarioFalso(), [], [])
    expect(vacio).not.toContain('pidió recordar')
    expect(vacio).not.toContain('ya hablaron de')

    const lleno = instruccionSistema(usuarioFalso(), [{ clave: 'area', valor: 'Bodega' }], ['clima'])
    expect(lleno).toContain('area: Bodega')
    expect(lleno).toContain('ya hablaron de: clima')
  })

  it('mantiene el prompt base acotado', () => {
    // El base viaja ENTERO en cada mensaje que llega al modelo. Este tope no es
    // estético: cada carácter que se le agregue se paga en latencia y en cuota
    // compartida en todas las peticiones futuras, así que crecer debe ser una
    // decisión consciente y no el resultado de ir añadiendo aclaraciones.
    //
    // ── Subió de 1200 a 1700 al construir el motor de herramientas ──────────
    // Lo que se compró con esos ~130 tokens por mensaje, en orden de valor:
    //  1. La regla vieja ("responde SOLO con lo que devuelvan tus
    //     herramientas") IMPEDÍA responder preguntas generales: el asistente
    //     contestaba "eso no lo cubren mis herramientas" a cosas que sabe.
    //     Distinguir dominio general vs. datos del Terminal es la corrección
    //     que habilita la mitad de los casos de uso pedidos.
    //  2. La instrucción de usar herramienta para todo lo que dependa de HOY:
    //     sin ella el modelo responde la hora y las tasas de memoria, con
    //     seguridad y equivocado.
    //  3. La regla de no dar por hecha una acción pendiente de confirmación.
    //
    // Si vuelve a crecer, que sea por una razón de este calibre y quede escrita
    // aquí. Recortar prosa nunca cuesta correcciones; recortar estas tres sí.
    expect(PROMPT_BASE.length).toBeLessThan(1700)
  })
})
