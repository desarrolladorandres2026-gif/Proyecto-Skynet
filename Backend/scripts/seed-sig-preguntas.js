// 10 preguntas de prueba para el banco del módulo "Cuestionarios Programados",
// cubriendo los 4 componentes por defecto (Calidad, Ambiental, SST,
// Integración SIG). Pasa por el service layer real (crearPregunta), no
// inserta documentos a mano, para ejercitar la misma validación que
// dispararía un admin real desde /sig/banco. Idempotente (busca por
// enunciado antes de crear) — mismo criterio que seed-danos.js.
import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Usuario from '../src/models/Usuario.js'
import PreguntaSig from '../src/models/PreguntaSig.js'
import { crearPregunta } from '../src/modules/sig_pregunta_dia/sig-banco.service.js'

const PREGUNTAS = [
  {
    enunciado: '¿Qué elemento de protección personal (EPP) es obligatorio para el personal que realiza mantenimiento en el taller del Terminal?',
    componenteSig: 'SST',
    tema: 'Uso de EPP',
    opciones: [
      { texto: 'Guantes de carnaza y gafas de seguridad', esCorrecta: true },
      { texto: 'Corbata y camisa de manga larga', esCorrecta: false },
      { texto: 'Sandalias antideslizantes', esCorrecta: false },
      { texto: 'Ninguno, no es obligatorio en tareas cortas', esCorrecta: false },
    ],
    retroalimentacion: {
      correcta: 'Correcto: guantes de carnaza y gafas de seguridad protegen manos y ojos frente a cortes, esquirlas y proyección de partículas.',
      incorrecta: 'Recuerda: en el taller siempre se usan guantes de carnaza y gafas de seguridad, sin importar cuánto dure la tarea.',
    },
  },
  {
    enunciado: '¿Qué se debe hacer antes de subir a una plataforma elevada para revisar la señalización del Terminal?',
    componenteSig: 'SST',
    tema: 'Trabajo en alturas',
    opciones: [
      { texto: 'Subir directamente si la tarea es rápida', esCorrecta: false },
      { texto: 'Verificar el arnés, el punto de anclaje y contar con la autorización correspondiente', esCorrecta: true },
      { texto: 'Avisar solo si la altura supera los 10 metros', esCorrecta: false },
      { texto: 'No es necesario ningún control si hay experiencia previa', esCorrecta: false },
    ],
    retroalimentacion: {
      correcta: 'Correcto: todo trabajo en alturas exige arnés certificado, punto de anclaje verificado y autorización previa.',
      incorrecta: 'Todo trabajo en alturas, sin importar la duración, exige arnés, punto de anclaje verificado y autorización.',
    },
  },
  {
    enunciado: '¿Qué debe hacer un trabajador que presencia un incidente sin lesión (casi-accidente) dentro del Terminal?',
    componenteSig: 'SST',
    tema: 'Reporte de incidentes',
    opciones: [
      { texto: 'No reportarlo porque no hubo lesión', esCorrecta: false },
      { texto: 'Reportarlo igual, ya que ayuda a prevenir accidentes futuros', esCorrecta: true },
      { texto: 'Reportarlo solo si un supervisor lo vio también', esCorrecta: false },
      { texto: 'Esperar a que se repita para confirmar que es un riesgo real', esCorrecta: false },
    ],
    retroalimentacion: {
      correcta: 'Correcto: reportar los casi-accidentes permite corregir riesgos antes de que causen una lesión real.',
      incorrecta: 'Todo casi-accidente debe reportarse: es una oportunidad de corregir el riesgo antes de que alguien salga lesionado.',
    },
  },
  {
    enunciado: '¿Cuál es la ruta de evacuación correcta si suena la alarma de emergencia en el área de plataformas?',
    componenteSig: 'SST',
    tema: 'Señalización de emergencia',
    opciones: [
      { texto: 'Cualquier salida, sin fijarse en la señalización', esCorrecta: false },
      { texto: 'La señalizada con las rutas de evacuación y el punto de encuentro asignado', esCorrecta: true },
      { texto: 'Quedarse en el puesto de trabajo hasta que alguien indique qué hacer', esCorrecta: false },
      { texto: 'Usar el ascensor para salir más rápido', esCorrecta: false },
    ],
    retroalimentacion: {
      correcta: 'Correcto: siempre se debe seguir la ruta de evacuación señalizada hasta el punto de encuentro asignado.',
      incorrecta: 'Debes seguir la ruta de evacuación señalizada y dirigirte al punto de encuentro asignado; nunca uses el ascensor en una emergencia.',
    },
  },
  {
    enunciado: '¿Cómo se deben separar los residuos generados en las oficinas administrativas del Terminal?',
    componenteSig: 'Ambiental',
    tema: 'Manejo de residuos sólidos',
    opciones: [
      { texto: 'Todo junto en una sola caneca para ahorrar tiempo', esCorrecta: false },
      { texto: 'Según el código de colores: aprovechables, no aprovechables y orgánicos', esCorrecta: true },
      { texto: 'Solo se separa el papel, el resto no importa', esCorrecta: false },
      { texto: 'Cada persona decide cómo separarlos', esCorrecta: false },
    ],
    retroalimentacion: {
      correcta: 'Correcto: separar por el código de colores facilita el reciclaje y reduce el impacto ambiental del Terminal.',
      incorrecta: 'La separación debe hacerse según el código de colores institucional: aprovechables, no aprovechables y orgánicos.',
    },
  },
  {
    enunciado: '¿Cuál de las siguientes acciones contribuye directamente al ahorro de agua en el Terminal?',
    componenteSig: 'Ambiental',
    tema: 'Ahorro de agua',
    opciones: [
      { texto: 'Dejar las llaves abiertas mientras se hace otra actividad', esCorrecta: false },
      { texto: 'Reportar de inmediato cualquier fuga visible', esCorrecta: true },
      { texto: 'Usar manguera a presión completa para toda la limpieza', esCorrecta: false },
      { texto: 'Ignorar los goteos porque son mínimos', esCorrecta: false },
    ],
    retroalimentacion: {
      correcta: 'Correcto: reportar fugas a tiempo evita el desperdicio de un recurso valioso y costos innecesarios.',
      incorrecta: 'Reportar cualquier fuga apenas se detecta es la acción que más aporta al ahorro de agua.',
    },
  },
  {
    enunciado: '¿Qué se espera del personal de atención al usuario cuando un pasajero presenta una queja en el Terminal?',
    componenteSig: 'Calidad',
    tema: 'Atención al usuario',
    opciones: [
      { texto: 'Ignorarla si parece poco importante', esCorrecta: false },
      { texto: 'Escuchar con atención, registrarla y darle el trámite establecido', esCorrecta: true },
      { texto: 'Responder solo si el pasajero insiste varias veces', esCorrecta: false },
      { texto: 'Remitirla sin registrar nada', esCorrecta: false },
    ],
    retroalimentacion: {
      correcta: 'Correcto: toda queja debe escucharse, registrarse y tramitarse según el procedimiento de atención al usuario.',
      incorrecta: 'Toda queja, sin importar su magnitud aparente, debe registrarse y tramitarse formalmente.',
    },
  },
  {
    enunciado: '¿Por qué es importante diligenciar correctamente los formatos institucionales del Sistema de Gestión de Calidad?',
    componenteSig: 'Calidad',
    tema: 'Documentación de procesos',
    opciones: [
      { texto: 'Porque garantizan trazabilidad y soporte de lo que se hizo', esCorrecta: true },
      { texto: 'Porque son solo un trámite sin utilidad real', esCorrecta: false },
      { texto: 'Porque los revisa la misma persona que los diligencia', esCorrecta: false },
      { texto: 'Porque solo se usan en auditorías externas', esCorrecta: false },
    ],
    retroalimentacion: {
      correcta: 'Correcto: los formatos bien diligenciados dan trazabilidad y evidencia de que los procesos se cumplieron.',
      incorrecta: 'Los formatos institucionales garantizan trazabilidad: son la evidencia de que un proceso se ejecutó correctamente.',
    },
  },
  {
    enunciado: '¿Cuál es el propósito principal del Sistema Integrado de Gestión (SIG) del Terminal?',
    componenteSig: 'Integración SIG',
    tema: 'Objetivo del SIG',
    opciones: [
      { texto: 'Cumplir un requisito legal sin impacto en la operación diaria', esCorrecta: false },
      { texto: 'Articular calidad, ambiente y seguridad para mejorar el servicio y proteger a las personas', esCorrecta: true },
      { texto: 'Aplicar solo al personal administrativo', esCorrecta: false },
      { texto: 'Reemplazar las funciones de cada área operativa', esCorrecta: false },
    ],
    retroalimentacion: {
      correcta: 'Correcto: el SIG articula calidad, ambiente y SST en un solo sistema para mejorar el servicio y proteger a las personas.',
      incorrecta: 'El SIG busca articular calidad, ambiente y SST para mejorar el servicio y proteger a quienes trabajan y transitan por el Terminal.',
    },
  },
  {
    enunciado: '¿Qué papel juega cada trabajador en el ciclo de mejora continua del SIG?',
    componenteSig: 'Integración SIG',
    tema: 'Mejora continua',
    opciones: [
      { texto: 'Ninguno, la mejora continua es responsabilidad exclusiva de la alta dirección', esCorrecta: false },
      { texto: 'Reportar hallazgos, seguir los procedimientos y proponer mejoras desde su puesto de trabajo', esCorrecta: true },
      { texto: 'Solo participar cuando hay una auditoría externa', esCorrecta: false },
      { texto: 'Esperar instrucciones sin proponer cambios', esCorrecta: false },
    ],
    retroalimentacion: {
      correcta: 'Correcto: la mejora continua se construye con la participación diaria de todos, reportando hallazgos y proponiendo mejoras.',
      incorrecta: 'Cada trabajador aporta a la mejora continua reportando hallazgos, cumpliendo procedimientos y proponiendo mejoras.',
    },
  },
]

async function seed() {
  await connectDB()

  const creador = await Usuario.findOne({ nombre_usuario: 'admin' })
  if (!creador) {
    console.error('No se encontró el usuario seed "admin" (corre primero: npm run seed)')
    process.exit(1)
  }
  const actor = { id_usuario: creador._id.toString(), nombre_usuario: creador.nombre_usuario }

  for (const p of PREGUNTAS) {
    const existente = await PreguntaSig.findOne({ enunciado: p.enunciado })
    if (existente) {
      console.log(`Ya existe, se omite: "${p.enunciado.slice(0, 60)}..."`)
      continue
    }
    await crearPregunta(p, actor)
    console.log(`Pregunta creada [${p.componenteSig}]: "${p.enunciado.slice(0, 60)}..."`)
  }

  await mongoose.disconnect()
  console.log('Seed de preguntas SIG completado.')
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
