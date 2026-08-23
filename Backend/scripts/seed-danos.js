// Reportes de daños/novedades demo para QA de TareasDanosPage.jsx: varía
// tipo, estado y presencia de foto (usa imágenes genéricas de picsum.photos,
// no Cloudinary real). Idempotente (busca por descripción antes de crear).
import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Usuario from '../src/models/Usuario.js'
import ReporteDano from '../src/models/ReporteDano.js'
import { guardaProduccion } from './lib/guardaProduccion.js'

guardaProduccion({ script: 'seed-danos.js', operacion: 'crear reportes de daños demo' })

const HORA = 60 * 60 * 1000
const haceHoras = (n) => new Date(Date.now() - n * HORA)

async function seed() {
  await connectDB()

  const reportante = await Usuario.findOne({ nombre_usuario: 'usuario.comun' })
  const reportanteAlterno = await Usuario.findOne({ nombre_usuario: 'usuario' })
  const atendido = await Usuario.findOne({ nombre_usuario: 'mantenimiento' })

  if (!reportante || !reportanteAlterno || !atendido) {
    console.error('Faltan usuarios seed (corre primero: npm run seed)')
    process.exit(1)
  }

  const REPORTES = [
    {
      tipo: 'dano',
      fecha: haceHoras(2),
      descripcion: 'Silla de la sala de espera del módulo 2 con el espaldar roto.',
      foto: { url: 'https://picsum.photos/seed/skynet-dano-1/640/480' },
      reportadoPor: reportante._id,
      estado: 'pendiente',
    },
    {
      tipo: 'dano',
      fecha: haceHoras(6),
      descripcion: 'Vidrio agrietado en la puerta de acceso a la plataforma 3.',
      foto: { url: 'https://picsum.photos/seed/skynet-dano-2/640/480' },
      reportadoPor: reportanteAlterno._id,
      estado: 'en_proceso',
      atendidoPor: atendido._id,
      observacionAtencion: 'Se contactó al proveedor de vidriería, a la espera de cotización.',
    },
    {
      tipo: 'dano',
      fecha: haceHoras(30),
      descripcion: 'Baño público del segundo piso sin agua desde la mañana.',
      foto: { url: 'https://picsum.photos/seed/skynet-dano-3/640/480' },
      reportadoPor: reportante._id,
      estado: 'resuelto',
      atendidoPor: atendido._id,
      observacionAtencion: 'Fuga reparada por mantenimiento, servicio restablecido.',
      fechaResolucion: haceHoras(20),
    },
    {
      tipo: 'dano',
      fecha: haceHoras(50),
      descripcion: 'Aviso luminoso de "Salida" apagado en el corredor central.',
      foto: { url: 'https://picsum.photos/seed/skynet-dano-4/640/480' },
      reportadoPor: reportanteAlterno._id,
      estado: 'pendiente',
    },
    {
      tipo: 'novedad',
      fecha: haceHoras(4),
      descripcion: 'La pantalla de horarios de la plataforma 5 muestra la hora desactualizada.',
      reportadoPor: reportante._id,
      estado: 'pendiente',
    },
    {
      tipo: 'sugerencia',
      fecha: haceHoras(12),
      descripcion: 'Sería útil una señal adicional que indique la ubicación de los baños desde la entrada principal.',
      reportadoPor: reportanteAlterno._id,
      estado: 'pendiente',
    },
    {
      tipo: 'otro',
      fecha: haceHoras(18),
      descripcion: 'Olor a humedad persistente en la bodega de encomiendas.',
      foto: { url: 'https://picsum.photos/seed/skynet-dano-5/640/480' },
      reportadoPor: reportante._id,
      estado: 'en_proceso',
      atendidoPor: atendido._id,
      observacionAtencion: 'Se programó visita técnica para revisar posible filtración.',
    },
    {
      tipo: 'dano',
      fecha: haceHoras(72),
      descripcion: 'Barra de la banca metálica frente al módulo 1 suelta, riesgo de caída.',
      foto: { url: 'https://picsum.photos/seed/skynet-dano-6/640/480' },
      reportadoPor: reportanteAlterno._id,
      estado: 'resuelto',
      atendidoPor: atendido._id,
      observacionAtencion: 'Banca asegurada nuevamente con soldadura.',
      fechaResolucion: haceHoras(60),
    },
  ]

  for (const r of REPORTES) {
    const existe = await ReporteDano.findOne({ descripcion: r.descripcion })
    if (existe) {
      console.log(`Ya existe, se omite: "${r.descripcion.slice(0, 50)}..."`)
      continue
    }
    await ReporteDano.create(r)
    console.log(`Reporte creado (${r.tipo}/${r.estado}): "${r.descripcion.slice(0, 50)}..."`)
  }

  await mongoose.disconnect()
  console.log('Seed de reportes de daños completado.')
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
