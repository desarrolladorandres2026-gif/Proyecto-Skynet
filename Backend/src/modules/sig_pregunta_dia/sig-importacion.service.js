import ExcelJS from 'exceljs'
import PreguntaSig from '../../models/PreguntaSig.js'
import { ErrorValidacion } from '../../utils/errores.js'
import { auditar, obtenerOCrearConfiguracion } from './comun.js'

// Carga masiva del banco de preguntas desde un Excel ya redactado (el formato
// en el que realmente trabaja SIG/HSEQ antes de que exista el módulo). Lee con
// ExcelJS, igual que sig-excel.service.js hace para exportar — sin dependencia
// nueva.
//
// ── Dos decisiones de diseño ────────────────────────────────────────────────
//
// 1. Importación PARCIAL, no todo-o-nada. Un archivo de 200 preguntas con un
//    error de dedo en la fila 37 debe importar las otras 199 y reportar esa
//    fila, no rechazarlo entero. El resultado devuelve `errores` con número de
//    fila y motivo para que el administrador corrija solo lo que falló.
//
// 2. Encabezados TOLERANTES. Nadie va a escribir "Opción A" con la tilde y la
//    mayúscula exactas: los títulos se normalizan (sin tildes, sin espacios,
//    minúsculas) y se comparan contra una lista de alias por columna, así que
//    "OPCION A", "Opcion_A" y "Respuesta A" caen todos en la misma columna.

const LETRAS = ['A', 'B', 'C', 'D']

// Alias aceptados por columna, ya normalizados. El primero de cada lista es el
// que usa la plantilla que descarga el administrador.
const ALIAS_COLUMNAS = {
  enunciado: ['enunciado', 'pregunta', 'preguntaenunciado', 'textodelapregunta'],
  componenteSig: ['componentesig', 'componente', 'componentedelsig', 'sig'],
  tema: ['tema', 'temaespecifico', 'subtema'],
  opcionA: ['opciona', 'a', 'respuestaa', 'opcion1'],
  opcionB: ['opcionb', 'b', 'respuestab', 'opcion2'],
  opcionC: ['opcionc', 'c', 'respuestac', 'opcion3'],
  opcionD: ['opciond', 'd', 'respuestad', 'opcion4'],
  correcta: ['respuestacorrecta', 'correcta', 'opcioncorrecta', 'clave', 'rta'],
  retroCorrecta: ['retroalimentacioncorrecta', 'retrocorrecta', 'mensajesiescorrecta', 'retroalimentacionsiacierta'],
  retroIncorrecta: ['retroalimentacionincorrecta', 'retroincorrecta', 'mensajesiesincorrecta', 'retroalimentacionsifalla'],
  etiquetas: ['etiquetas', 'tags', 'etiqueta'],
}

const COLUMNAS_OBLIGATORIAS = ['enunciado', 'componenteSig', 'tema', 'opcionA', 'opcionB', 'opcionC', 'opcionD', 'correcta']

function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // marcas de acento que deja NFD
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

// El valor de una celda de ExcelJS puede ser string, número, fecha, texto
// enriquecido, hipervínculo o el resultado de una fórmula. Todo termina aquí
// convertido a texto plano recortado.
function textoCelda(celda) {
  const valor = celda?.value
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'object') {
    if (Array.isArray(valor.richText)) return valor.richText.map((t) => t.text).join('').trim()
    if (valor.result !== undefined) return String(valor.result).trim()
    if (valor.text !== undefined) return String(valor.text).trim()
    return ''
  }
  return String(valor).trim()
}

// Mapea los encabezados de la primera fila a nuestros nombres de campo.
// Devuelve { enunciado: 1, componenteSig: 2, ... } con el número de columna.
function mapearEncabezados(filaEncabezado) {
  const mapa = {}
  filaEncabezado.eachCell((celda, numeroColumna) => {
    const titulo = normalizar(textoCelda(celda))
    if (!titulo) return
    for (const [campo, alias] of Object.entries(ALIAS_COLUMNAS)) {
      if (mapa[campo] === undefined && alias.includes(titulo)) {
        mapa[campo] = numeroColumna
        return
      }
    }
  })
  return mapa
}

// Resuelve qué opción marcó el archivo como correcta. Se aceptan tres formas
// porque las tres aparecen en archivos reales: la letra ("B"), el número
// ("2") o el texto completo de la opción copiado y pegado.
function indiceDeCorrecta(valor, textosOpciones) {
  const bruto = String(valor ?? '').trim()
  if (!bruto) return -1

  const porLetra = LETRAS.indexOf(normalizar(bruto).toUpperCase())
  if (porLetra !== -1) return porLetra

  const numero = Number(bruto)
  if (Number.isInteger(numero) && numero >= 1 && numero <= 4) return numero - 1

  return textosOpciones.findIndex((t) => normalizar(t) === normalizar(bruto))
}

// Componente contra el catálogo configurado, comparando sin tildes ni
// mayúsculas pero devolviendo SIEMPRE el nombre canónico configurado — para
// que los filtros y el dashboard no terminen con "SST" y "sst" como dos
// componentes distintos.
function resolverComponente(valor, componentesConfigurados) {
  const buscado = normalizar(valor)
  return componentesConfigurados.find((c) => normalizar(c) === buscado) || null
}

// ── Política de duplicados ──────────────────────────────────────────────────
//
// Qué cuenta como "esta pregunta ya está en el banco". Hoy: mismo enunciado,
// comparado sin tildes, sin mayúsculas y sin puntuación. Es la regla más
// estricta y la más segura para una primera carga masiva.
//
// Si la operación de SIG/HSEQ pide otra cosa, este es el único punto a
// cambiar. Alternativas razonables, con su contrapartida:
//
//   • Enunciado + componente: permite la misma pregunta redactada igual en
//     Calidad y en SST. Más flexible, pero deja pasar copiar-pegar por error
//     entre hojas de un mismo archivo.
//   • Enunciado + tema: útil si un mismo enunciado se reformula por tema.
//   • Sin deduplicación: importa todo y deja la limpieza al banco. Solo tiene
//     sentido si el archivo se revisa a mano antes de subirlo.
//
// `conocidos` es un Set de claves ya vistas (las del banco más las filas
// aceptadas antes en este mismo archivo), y `clavePregunta` debe producir la
// clave con el mismo criterio para que ambas cosas casen.
function clavePregunta({ enunciado }) {
  return normalizar(enunciado)
}

export async function importarPreguntasDesdeExcel(buffer, usuarioActor) {
  if (!buffer?.length) throw new ErrorValidacion('No se recibió ningún archivo')

  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(buffer)
  } catch {
    throw new ErrorValidacion('No se pudo leer el archivo. Debe ser un Excel .xlsx válido')
  }

  const hoja = workbook.worksheets[0]
  if (!hoja || hoja.rowCount < 2) {
    throw new ErrorValidacion('El archivo no tiene filas de preguntas debajo del encabezado')
  }

  const columnas = mapearEncabezados(hoja.getRow(1))
  const faltantes = COLUMNAS_OBLIGATORIAS.filter((c) => columnas[c] === undefined)
  if (faltantes.length) {
    throw new ErrorValidacion(
      `Al archivo le faltan columnas obligatorias: ${faltantes.join(', ')}. Descarga la plantilla para ver el formato esperado.`
    )
  }

  const config = await obtenerOCrearConfiguracion()

  // Enunciados que ya existen en el banco, normalizados, para detectar
  // duplicados sin una consulta por fila.
  const existentes = await PreguntaSig.find({}).select('enunciado componenteSig tema')
  const conocidos = new Set(existentes.map(clavePregunta))

  const errores = []
  const duplicadas = []
  const aCrear = []

  for (let numeroFila = 2; numeroFila <= hoja.rowCount; numeroFila++) {
    const fila = hoja.getRow(numeroFila)
    const leer = (campo) => (columnas[campo] === undefined ? '' : textoCelda(fila.getCell(columnas[campo])))

    // Fila completamente vacía (Excel las deja de sobra al final del archivo):
    // se ignora en silencio, no es un error que valga la pena reportar.
    if (!COLUMNAS_OBLIGATORIAS.some((c) => leer(c))) continue

    const enunciado = leer('enunciado')
    const anotarError = (mensaje) => errores.push({ fila: numeroFila, enunciado: enunciado.slice(0, 60), mensaje })

    if (!enunciado) {
      anotarError('Falta el enunciado')
      continue
    }

    const componenteSig = resolverComponente(leer('componenteSig'), config.componentes)
    if (!componenteSig) {
      anotarError(
        `El componente "${leer('componenteSig')}" no está configurado. Válidos: ${config.componentes.join(', ')}`
      )
      continue
    }

    const tema = leer('tema')
    if (!tema) {
      anotarError('Falta el tema')
      continue
    }

    const textosOpciones = ['opcionA', 'opcionB', 'opcionC', 'opcionD'].map(leer)
    const vacia = textosOpciones.findIndex((t) => !t)
    if (vacia !== -1) {
      anotarError(`La opción ${LETRAS[vacia]} está vacía; se necesitan las 4 opciones`)
      continue
    }

    const indiceCorrecta = indiceDeCorrecta(leer('correcta'), textosOpciones)
    if (indiceCorrecta === -1) {
      anotarError(`No se entiende cuál es la respuesta correcta ("${leer('correcta')}"). Escribe A, B, C o D`)
      continue
    }

    // Duplicados: se omiten y se reportan aparte de los errores. Se comprueba
    // también contra las filas ya aceptadas de ESTE archivo, no solo contra el
    // banco, porque un archivo puede traer la misma pregunta dos veces.
    const clave = clavePregunta({ enunciado, componenteSig, tema })
    if (conocidos.has(clave)) {
      duplicadas.push({ fila: numeroFila, enunciado: enunciado.slice(0, 80) })
      continue
    }
    conocidos.add(clave)

    aCrear.push({
      enunciado,
      opciones: textosOpciones.map((texto, i) => ({ texto, esCorrecta: i === indiceCorrecta })),
      componenteSig,
      tema,
      retroalimentacion: {
        correcta: leer('retroCorrecta'),
        incorrecta: leer('retroIncorrecta'),
      },
      etiquetas: leer('etiquetas')
        .split(/[,;]/)
        .map((t) => t.trim())
        .filter(Boolean),
      creadoPor: usuarioActor.id_usuario,
    })
  }

  let creadas = []
  if (aCrear.length) {
    // ordered:false para que una fila que igual falle la validación del schema
    // (defensa en profundidad; las reglas de negocio ya se validaron arriba) no
    // impida insertar el resto del lote.
    creadas = await PreguntaSig.insertMany(aCrear, { ordered: false })
  }

  if (creadas.length) {
    await auditar(
      usuarioActor,
      'importar',
      'PreguntaSig',
      creadas[0]._id,
      `Importó ${creadas.length} pregunta(s) al banco desde un archivo Excel`
    )
  }

  return {
    importadas: creadas.length,
    filasLeidas: Math.max(0, hoja.rowCount - 1),
    duplicadas,
    errores,
  }
}

// Plantilla descargable: encabezados exactos, una fila de ejemplo y una hoja
// de instrucciones con los componentes realmente configurados. Es el
// contrapeso de los encabezados tolerantes — quien parte de aquí no falla.
export async function generarPlantillaExcel() {
  const config = await obtenerOCrearConfiguracion()

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Skynet'
  workbook.created = new Date()

  const hoja = workbook.addWorksheet('Preguntas')
  hoja.columns = [
    { header: 'Enunciado', key: 'enunciado', width: 60 },
    { header: 'Componente SIG', key: 'componenteSig', width: 20 },
    { header: 'Tema', key: 'tema', width: 28 },
    { header: 'Opción A', key: 'opcionA', width: 30 },
    { header: 'Opción B', key: 'opcionB', width: 30 },
    { header: 'Opción C', key: 'opcionC', width: 30 },
    { header: 'Opción D', key: 'opcionD', width: 30 },
    { header: 'Respuesta correcta', key: 'correcta', width: 18 },
    { header: 'Retroalimentación correcta', key: 'retroCorrecta', width: 40 },
    { header: 'Retroalimentación incorrecta', key: 'retroIncorrecta', width: 40 },
    { header: 'Etiquetas', key: 'etiquetas', width: 24 },
  ]
  hoja.getRow(1).font = { bold: true }
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } }
  hoja.views = [{ state: 'frozen', ySplit: 1 }]

  hoja.addRow({
    enunciado: '¿Cuál es el elemento de protección obligatorio para trabajo en alturas?',
    componenteSig: config.componentes[0] || 'SST',
    tema: 'Trabajo en alturas',
    opcionA: 'Arnés de cuerpo completo',
    opcionB: 'Guantes de carnaza',
    opcionC: 'Botas de caucho',
    opcionD: 'Tapabocas',
    correcta: 'A',
    retroCorrecta: 'Correcto: el arnés es obligatorio por encima de 1,50 m.',
    retroIncorrecta: 'Recuerda: por encima de 1,50 m el arnés de cuerpo completo es obligatorio.',
    etiquetas: 'alturas, epp',
  })

  const instrucciones = workbook.addWorksheet('Instrucciones')
  instrucciones.columns = [{ width: 100 }]
  const lineas = [
    'CÓMO LLENAR ESTA PLANTILLA',
    '',
    '1. Escribe una pregunta por fila en la hoja "Preguntas", debajo del encabezado.',
    '2. No cambies ni borres la fila de encabezados.',
    '3. Las 4 opciones (A, B, C y D) son obligatorias: toda pregunta es de selección única con 4 alternativas.',
    '4. En "Respuesta correcta" escribe la letra: A, B, C o D. También se acepta el número (1 a 4).',
    '5. Las columnas de retroalimentación y etiquetas son opcionales. Separa varias etiquetas con coma.',
    '6. "Componente SIG" debe ser uno de los configurados en el sistema:',
    ...config.componentes.map((c) => `      - ${c}`),
    '',
    'QUÉ PASA AL SUBIR EL ARCHIVO',
    '',
    '- Las preguntas válidas entran al banco como ACTIVAS y quedan listas para programar.',
    '- Si una fila tiene un error, esa fila se omite y el sistema te dice cuál es y por qué; las demás sí se importan.',
    '- Si el enunciado ya existe en el banco, la fila se omite como duplicada (no se crean preguntas repetidas).',
  ]
  lineas.forEach((texto, i) => {
    const fila = instrucciones.addRow([texto])
    if (i === 0 || texto === 'QUÉ PASA AL SUBIR EL ARCHIVO') fila.font = { bold: true, size: 12 }
  })

  return workbook.xlsx.writeBuffer()
}
