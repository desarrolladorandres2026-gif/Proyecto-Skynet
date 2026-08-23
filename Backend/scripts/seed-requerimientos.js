// 4 solicitudes de requerimientos demo para QA del flujo Solicitante ->
// Financiero -> Bodega: cubre compra y servicio, y los 3 estados posibles
// (pendiente_financiero, pendiente_bodega, rechazado). Pasa por el service
// layer real (no inserta documentos a mano) para ejercitar la misma
// validación/normalización/auditoría que un usuario real dispararía.
// Idempotente (busca por el texto distintivo de cada ítem/servicio antes de
// crear).
import mongoose from 'mongoose'
import { connectDB } from '../src/config/db.js'
import Usuario from '../src/models/Usuario.js'
import Requerimiento from '../src/models/Requerimiento.js'
import { hashPassword } from '../src/utils/password.js'
import { sembrarCatalogoRBAC } from '../src/seedData/rbacCatalogo.js'
import { crearRequerimiento, aprobarComoFinanciero, rechazarComoFinanciero } from '../src/modules/requerimientos/requerimientos.service.js'
import { guardaProduccion } from './lib/guardaProduccion.js'

guardaProduccion({ script: 'seed-requerimientos.js', operacion: 'crear requerimientos demo' })

const DIA = 24 * 60 * 60 * 1000
const haceDias = (n) => new Date(Date.now() - n * DIA)

const FINANCIERO_PASSWORD = process.env.SEED_FINANCIERO_PASSWORD || 'Financiero.Skynet.2026'

async function crearUsuarioSiNoExiste({ email, password, rolId, rolNombre, ...resto }) {
  const existente = await Usuario.findOne({ email })
  if (existente) return existente
  const passwordHash = await hashPassword(password)
  const creado = await Usuario.create({ email, password: passwordHash, rol: rolId, ...resto })
  console.log(`Usuario creado: email="${email}" password="${password}" (rol: ${rolNombre})`)
  return creado
}

function actorDe(usuario) {
  return { id_usuario: usuario._id.toString(), nombre_usuario: usuario.nombre_usuario }
}

async function crearSiNoExiste(campoUnico, valorUnico, crearFn) {
  const existente = await Requerimiento.findOne({ [campoUnico]: valorUnico })
  if (existente) {
    console.log(`Ya existe, se omite: "${valorUnico.slice(0, 60)}..."`)
    return existente
  }
  const doc = await crearFn()
  console.log(`Requerimiento creado: "${valorUnico.slice(0, 60)}..."`)
  return doc
}

async function seed() {
  await connectDB()

  const rolIdPorSlug = await sembrarCatalogoRBAC()

  // El rol dedicado 'Financiero' se eliminó (2026-08-05): esta cuenta demo
  // ahora usa 'Dir. Administrativo y Gestión' (slug 'administrativo_financiero'
  // sin cambios — ver rbac.data.js). OJO: si este seed se vuelve a correr
  // desde cero, el paso de abajo que aprueba un requerimiento fallará porque
  // aprobarComoFinanciero exige firma.url registrada — este usuario demo no
  // tiene una (no se genera una firma falsa aquí; regístrala manualmente en
  // /requerimientos/mi-firma si necesitas que este script corra la
  // aprobación de nuevo).
  const financiero = await crearUsuarioSiNoExiste({
    nombre_usuario: 'financiero',
    nombre: 'Jefe Financiero de Prueba',
    email: 'financiero@skynet.local',
    password: FINANCIERO_PASSWORD,
    rolId: rolIdPorSlug.get('administrativo_financiero'),
    rolNombre: 'Dir. Administrativo y Gestión',
    cargo: 'Jefe Financiero y Administrativo',
    modulos: [],
    estado: 'activo',
  })

  await crearUsuarioSiNoExiste({
    nombre_usuario: 'bodega',
    nombre: 'Encargado de Bodega de Prueba',
    email: 'bodega@skynet.local',
    password: process.env.SEED_BODEGA_PASSWORD || 'Bodega.Skynet.2026',
    rolId: rolIdPorSlug.get('bodega'),
    rolNombre: 'Bodega',
    cargo: 'Auxiliar de Bodega',
    modulos: [],
    estado: 'activo',
  })

  const usuarioComun = await Usuario.findOne({ nombre_usuario: 'usuario.comun' })
  const usuarioOperador = await Usuario.findOne({ nombre_usuario: 'usuario' })
  if (!usuarioComun || !usuarioOperador) {
    console.error('Faltan usuarios seed base (corre primero: npm run seed)')
    process.exit(1)
  }
  const actorComun = actorDe(usuarioComun)
  const actorOperador = actorDe(usuarioOperador)
  const actorFinanciero = actorDe(financiero)

  // 1) Compra, queda pendiente de Financiero (bandeja Financiero).
  await crearSiNoExiste('itemsCompra.descripcionProducto', 'Resma de papel tamaño carta', () =>
    crearRequerimiento(
      {
        tipo: 'compra',
        cargo: 'Auxiliar Administrativo',
        areaOProceso: 'Recepción y Taquillas',
        itemsCompra: [
          { fechaSolicitud: haceDias(1), descripcionProducto: 'Resma de papel tamaño carta', cantidad: 10, destino: 'Taquillas' },
          { fechaSolicitud: haceDias(1), descripcionProducto: 'Tóner para impresora HP LaserJet', cantidad: 2, destino: 'Oficina de Recepción' },
        ],
      },
      actorComun
    )
  )

  // 2) Servicio, queda pendiente de Financiero (bandeja Financiero).
  await crearSiNoExiste('detalleServicio.descripcionTipoServicio', 'Mantenimiento preventivo de aires acondicionados de la sala VIP', () =>
    crearRequerimiento(
      {
        tipo: 'servicio',
        cargo: 'Técnico de Plataformas',
        areaOProceso: 'Mantenimiento de Infraestructura',
        detalleServicio: {
          descripcionTipoServicio: 'Mantenimiento preventivo de aires acondicionados de la sala VIP',
          competencia: 'Técnico certificado en refrigeración',
          laboresADesarrollar: 'Limpieza de filtros, revisión de gas refrigerante y calibración de termostatos',
          requisitosSST: 'Uso de EPP; no requiere trabajo en alturas',
        },
      },
      actorOperador
    )
  )

  // 3) Compra, ya aprobada por Financiero -> pendiente de Bodega (bandeja Bodega).
  await crearSiNoExiste('itemsCompra.descripcionProducto', 'Escobas industriales', async () => {
    const doc = await crearRequerimiento(
      {
        tipo: 'compra',
        cargo: 'Auxiliar de Aseo',
        areaOProceso: 'Servicios Generales',
        itemsCompra: [
          { fechaSolicitud: haceDias(3), descripcionProducto: 'Escobas industriales', cantidad: 6, destino: 'Bodega de Aseo' },
          { fechaSolicitud: haceDias(3), descripcionProducto: 'Guantes de caucho talla M', cantidad: 12, destino: 'Bodega de Aseo' },
        ],
      },
      actorComun
    )
    return aprobarComoFinanciero(
      doc._id,
      { password: FINANCIERO_PASSWORD, analisisTecnico: 'Compra justificada por desgaste normal de insumos de aseo.' },
      actorFinanciero
    )
  })

  // 4) Servicio, rechazado por Financiero (rechazo definitivo).
  await crearSiNoExiste('detalleServicio.descripcionTipoServicio', 'Instalación de cámaras adicionales de seguridad en el parqueadero de buses', async () => {
    const doc = await crearRequerimiento(
      {
        tipo: 'servicio',
        cargo: 'Conductor',
        areaOProceso: 'Operaciones',
        detalleServicio: {
          descripcionTipoServicio: 'Instalación de cámaras adicionales de seguridad en el parqueadero de buses',
          competencia: 'Empresa certificada en CCTV',
          laboresADesarrollar: 'Instalación de 4 cámaras domo y cableado hasta el centro de monitoreo',
          requisitosSST: 'Trabajo en alturas menor a 1.8m, uso de escalera certificada',
        },
      },
      actorOperador
    )
    return rechazarComoFinanciero(
      doc._id,
      { motivoRechazo: 'No hay presupuesto disponible para este trimestre; se sugiere reformular la solicitud en el siguiente periodo fiscal.' },
      actorFinanciero
    )
  })

  await mongoose.disconnect()
  console.log('Seed de requerimientos completado.')
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
