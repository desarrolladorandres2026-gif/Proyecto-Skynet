/**
 * Carga el cargo de cada empleado en Usuario.cargo a partir del censo de
 * personal del Terminal (planta al 2026-09-12, 91 personas).
 *
 * Para qué: `cargo` estaba vacío en 88 de los 91 usuarios reales, y no es un
 * campo decorativo — prellena el campo "Cargo" de los formularios
 * institucionales (Requerimientos) y el bloque de firma de quien aprueba (ver
 * models/Usuario.js). Además es el único dato fiable para saber quién es
 * personal administrativo: `dependencia` NO sirve para eso, está en
 * 'Operativo' incluso para la Gerente y las dos Directoras.
 *
 * Los documentos ya firmados NO se reescriben: cada uno guarda su propio
 * snapshot del cargo al momento de firmarse (ver el comentario de `cargo` en
 * models/Usuario.js), así que corregirlo aquí solo afecta a lo que se firme
 * de ahora en adelante.
 *
 * Cómo empareja: por Usuario.nombre normalizado (sin acentos, mayúsculas
 * unificadas, espacios colapsados) — en la base hay nombres con doble espacio
 * y con tilde, así que comparar el literal dejaría fuera a gente que sí está.
 * Todo nombre del censo que no aparezca en la base, y todo usuario real de la
 * base que no esté en el censo, se REPORTA en vez de adivinarse: un cargo
 * asignado a la persona equivocada acabaría estampado en un documento firmado.
 *
 * Idempotente. Por defecto SOLO SIMULA; hay que pasar --aplicar para escribir.
 *
 * Uso:
 *   node scripts/cargar-cargos-personal.js            # simulación
 *   node scripts/cargar-cargos-personal.js --aplicar  # escribe
 */

import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Usuario from '../src/models/Usuario.js'
import { guardaProduccion } from './lib/guardaProduccion.js'

const APLICAR = process.argv.includes('--aplicar')

if (APLICAR) {
  guardaProduccion({
    script: 'cargar-cargos-personal.js',
    operacion: 'escribir el cargo de la planta de personal en Usuario.cargo',
  })
}

// Censo entregado por el Terminal. Se transcribe tal cual, incluidos los
// cargos que se repiten: la fuente es la planta de personal, no una lista
// depurada, y "corregir" un cargo aquí sería inventar datos de nómina.
const CENSO = [
  ['MARIA BLAYNER MURILLO ZAMBRANO', 'TESORERO - PAGADOR'],
  ['FRANCISCO JAVIER MONTALVO VARGAS', 'AUXILIAR DE GESTION ADMINISTRATIVA Y RECURSOS FISICOS'],
  ['LAURA SOFIA NUÑEZ VEGA', 'AUXILIAR ADMINISTRATIVO DE GERENCIA'],
  ['JUAN FELIPE MOSQUERA BASTIDAS', 'GESTOR DE COMUNICACIONES Y DESARROLLO COMERCIAL'],
  ['ANDRES STIVEN CERQUERA YUCUMÁ', 'CONTADOR'],
  ['VERONICA ORTIZ SABOGAL', 'AUXILIAR OPERATIVO EN LOS PROGRAMAS DE ALCOHOLIMETRIA'],
  ['HENRY BARON ZAMBRANO', 'LIDER TI'],
  ['KAROL DAYANNA TAMAYO TOVAR', 'AUXILIAR ADMINISTRATIVO Y GESTION HUMANA'],
  ['KARENTH JULIETH FALLA NINCO', 'DIRECTORA ADMINISTRATIVA'],
  ['JHON JAIRO TOVAR PERDOMO', 'COORDINADOR OPERATIVO'],
  ['KATHERIN LUCERO BORDA BUITRAGO', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['ANA MARIA BERMUDEZ MACIAS', 'DIRECTORA OPERATIVA'],
  ['MIGUEL ANGEL GONZALEZ BEDOYA', 'AUXILIAR ADMINISTRATIVO'],
  ['DIANA CAROLINA NAVIA CORTES', 'AUXILIAR DE CONTABILIDAD'],
  ['SAMARA RODRIGUEZ RAMIREZ', 'SECRETARIA DE GERENCIA'],
  ['ANGELICA ALEXANDRA CALDERON CASTAÑEDA', 'COORDINADORA HSEQ'],
  ['RAHDA HERMOSA CAMACHO', 'GERENTE'],
  ['LEIDY MARYURY TOLEDO GARCIA', 'AUXILIAR ADMINISTRATIVO'],
  ['ANDRES FELIPE MARTINEZ ÑAÑEZ', 'APRENDIZ SENA'],
  ['ANDRES CAMILO GARZON ESCOBAR', 'APRENDIZ SENA'],
  ['ERIKA MARITZA QUILINDO GUAÑARITA', 'APRENDIZ SENA'],
  ['AKXEL MICHELL MORENO ORTIZ', 'AUXILIAR DE MANTENIMIENTO'],
  ['DIEGO ARMANDO OSSA ANAYA', 'JARDINERO'],
  ['PAULA ANDREA SILVA GONZALEZ', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['NIYIFER HERNANDEZ GONZALEZ', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['YURANY CASTRO PRIETO', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['ANGELA MARIA CUSPIAN SAMBONY', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['KENY YOHANNA OVIEDO SUAZA', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['LINDA LUCIA CEDEÑO SANCHEZ', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['YINA MARCELA MACIAS GONZALEZ', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['DORY EDITH SUAREZ OSPITIA', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['EDUARDO SANCHEZ FIERRO', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['JOHAN ANDRES TEJADA ROMERO', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['NELSY STHEFANIA OSSA ANAYA', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['PAULA ANDREA CONDE MORA', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['MONICA ALEJANDRA CHACON TOVAR', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['MAIDY ALEJANDRA SALDAÑA DUSSAN', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['YUMARLI CALDERON SOLANO', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['MAGDA LILIANA BARRIOS LOSADA', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['DELCY YAIRETH GARCIA MURCIA', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['ISABEL RODRIGUEZ CARDENAS', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['OLGA PATRICIA ARTUNDUAGA GONZALEZ', 'AUXILIAR DE SERVICIOS GENERALES'],
  ['DIANA MILENA GARCIA CADENA', 'AUXILIAR OPERATIVO 2'],
  ['NICOLAS PUENTES QUINTERO', 'AUXILIAR OPERATIVO 2'],
  ['JEILER ARLEY BARRERA GONZALEZ', 'AUXILIAR OPERATIVO 2'],
  ['BAIRON JAVIER GOMEZ BOLAÑOS', 'COORDINADOR OPERATIVO'],
  ['ESTEBAN LEONARDO CHARRY CORREA', 'AUXILIAR OPERATIVO 2'],
  ['FRANCISCO JAVIER RICAURTE DIAZ', 'AUXILIAR OPERATIVO 2'],
  ['CLAUDIA PATRICIA HERNANDEZ AGUIRRE', 'AUXILIAR OPERATIVO 2'],
  ['MANUEL FERNANDO SALGADO FIERRO', 'AUXILIAR OPERATIVO 2'],
  ['FABIO JULIAN SALAZAR VIDAL', 'AUXILIAR OPERATIVO 2'],
  ['YESICA LORENA PERALTA GONZALEZ', 'AUXILIAR OPERATIVO 2'],
  ['CRISTYAN FABIAN CUBILLOS FLOR', 'AUXILIAR OPERATIVO 2'],
  ['RODRIGO ROJAS REYES', 'AUXILIAR OPERATIVO 2'],
  ['TANIA MICHELY NIETO GUZMAN', 'AUXILIAR OPERATIVO 2'],
  ['MONICA CONSTANZA MENDEZ VASQSUEZ', 'AUXILIAR OPERATIVO 2'],
  ['ANDRES SANTIAGO CRUZ CASTRO', 'AUXILIAR OPERATIVO 2'],
  ['DIEGO ANDRES CORTES RIVERA', 'AUXILIAR OPERATIVO 2'],
  ['SEBASTIAN CASTRO GUAÑARITA', 'AUXILIAR OPERATIVO 2'],
  ['KAREN JULIETH VARON CAMPOS', 'AUXILIAR OPERATIVO 2'],
  ['HENRY STEVEN RUIZ HERNANDEZ', 'AUXILIAR OPERATIVO 2'],
  ['JHOJJAN DAVID CHAMBO RODRIGUEZ', 'AUXILIAR OPERATIVO 2'],
  ['MICHELL DALLANA CARDENAS CARDENAS', 'AUXILIAR OPERATIVO 2'],
  ['FERNANDO DARIO BUCHELLY CHARRY', 'AUXILIAR OPERATIVO 2'],
  ['MARIA GORETTY CONDE ALVAREZ', 'AUXILIAR OPERATIVO 2'],
  ['JESUS DAVID CARRILLO VARGAS', 'AUXILIAR OPERATIVO 2'],
  ['IVAN GONZALO CUELLAR TAPIERO', 'AUXILIAR OPERATIVO 2'],
  ['GRACILIANA YOLANDA OLIVA RIVERA', 'AUXILIAR OPERATIVO 2'],
  ['JHONNIER MAURICIO MENDOZA CHALA', 'AUXILIAR OPERATIVO 2'],
  ['SANTIAGO DUSSAN GARCIA', 'AUXILIAR OPERATIVO 2'],
  ['BRAYAN STIVEN PAEZ RONDON', 'AUXILIAR OPERATIVO 2'],
  ['PAULA ANDREA DIAZ ZAMORA', 'AUXILIAR OPERATIVO 2'],
  ['LUIS FERNANDO TORRES NUÑEZ', 'AUXILIAR OPERATIVO 2'],
  ['JORGE LEONARDO OLAYA DELGADO', 'AUXILIAR OPERATIVO 2'],
  ['JUAN ESTEBAN AYALA RUSINQUE', 'AUXILIAR OPERATIVO 2'],
  ['LUIS ALFONSO ROJAS SANZA', 'AUXILIAR OPERATIVO 2'],
  ['JONATAN SANCHEZ HERMOSA', 'AUXILIAR OPERATIVO 2'],
  ['ALVARO HOYOS ROMERO', 'AUXILIAR OPERATIVO 2'],
  ['JUAN CAMILO CASTAÑEDA BUSTOS', 'AUXILIAR OPERATIVO 2'],
  ['ZULI MALEIDY ZAMBRANO POLANIA', 'AUXILIAR OPERATIVO 2'],
  ['WILLIAM ANDRES CARRILLO POLO', 'AUXILIAR OPERATIVO 2'],
  ['SERGIO ANDRES LEON NASAYO', 'AUXILIAR OPERATIVO 2'],
  ['JOSE ANEYDER RODRIGUEZ VASQUEZ', 'AUXILIAR OPERATIVO 2'],
  ['KATERINE TAPIA YAGUARA', 'AUXILIAR OPERATIVO 2'],
  ['PAULA ANDREA MINU DIAZ', 'AUXILIAR OPERATIVO 2'],
  ['CLAUDIA PATRICIA PEREZ ANGEL', 'INSPECTOR DE CONTROL'],
  ['EDINSSON TOVAR ROJAS', 'INSPECTOR DE CONTROL'],
  ['EVER TAMAYO ZUÑIGA', 'INSPECTOR DE CONTROL'],
  ['FERNANDO IPUZ', 'INSPECTOR DE CONTROL'],
  ['LUIS ERNESTO MONCALEANO PERDOMO', 'INSPECTOR DE CONTROL'],
  ['PEDRO JOSE YEPES CASANOVA', 'INSPECTOR DE CONTROL'],
]

// Quita acentos, unifica mayúsculas y colapsa espacios. La Ñ se preserva a
// propósito: normalizarla a N colapsaría apellidos que en realidad son
// distintos (NUÑEZ / NUNEZ), y aquí un falso emparejamiento escribe el cargo
// de otra persona.
function clave(nombre) {
  return String(nombre || '')
    .normalize('NFD')
    .replace(/[̀-̂̄-ͯ]/g, '')
    .normalize('NFC')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

async function run() {
  await connectDB()

  const usuarios = await Usuario.find({ estado: 'activo', esPrueba: false }).select('nombre cargo email')
  const porClave = new Map()
  for (const u of usuarios) {
    const k = clave(u.nombre)
    if (porClave.has(k)) {
      console.warn(`⚠️  Nombre duplicado en la base: "${u.nombre}" — se omite por ambigüedad.`)
      porClave.set(k, null)
      continue
    }
    porClave.set(k, u)
  }

  const aEscribir = []
  const sinCambio = []
  const noEncontrados = []
  const emparejados = new Set()

  for (const [nombre, cargo] of CENSO) {
    const u = porClave.get(clave(nombre))
    if (!u) {
      noEncontrados.push(nombre)
      continue
    }
    emparejados.add(clave(nombre))
    if (u.cargo === cargo) sinCambio.push(u)
    else aEscribir.push({ usuario: u, cargo, anterior: u.cargo })
  }

  console.log(`\nCenso: ${CENSO.length} personas — Usuarios activos reales en la base: ${usuarios.length}`)
  console.log(`  Ya tenían el cargo correcto: ${sinCambio.length}`)
  console.log(`  ${APLICAR ? 'Se escriben' : 'Se escribirían'}: ${aEscribir.length}`)

  if (noEncontrados.length) {
    console.log(`\n⚠️  En el censo pero NO en la base (${noEncontrados.length}) — revisar a mano, no se toca nada:`)
    for (const n of noEncontrados) console.log(`      ${n}`)
  }

  const sobrantes = usuarios.filter((u) => !emparejados.has(clave(u.nombre)))
  if (sobrantes.length) {
    console.log(`\n⚠️  En la base pero NO en el censo (${sobrantes.length}) — se quedan con el cargo que tengan:`)
    for (const u of sobrantes) console.log(`      ${u.nombre} — cargo actual: ${u.cargo || '(vacío)'} — ${u.email}`)
  }

  if (aEscribir.length) {
    console.log(`\n${APLICAR ? '✏️  Escribiendo:' : '🔎  Cambios que se harían:'}`)
    for (const { usuario, cargo, anterior } of aEscribir) {
      console.log(`      ${String(usuario.nombre).padEnd(38)} ${anterior ? `"${anterior}"` : '(vacío)'} → "${cargo}"`)
    }
  }

  if (APLICAR && aEscribir.length) {
    const res = await Usuario.bulkWrite(
      aEscribir.map(({ usuario, cargo }) => ({
        updateOne: { filter: { _id: usuario._id }, update: { $set: { cargo } } },
      }))
    )
    console.log(`\n✅  ${res.modifiedCount} cargo(s) actualizado(s).`)
  } else if (!APLICAR) {
    console.log('\nℹ️  Simulación: no se escribió nada. Repite con --aplicar para ejecutar.')
  }

  console.log('\n🏁  Listo.')
  await mongoose.disconnect()
}

run().catch((err) => {
  console.error('Error inesperado:', err)
  process.exit(1)
})
