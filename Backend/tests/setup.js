import { beforeAll, afterEach, afterAll } from 'vitest'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { reiniciarCuota } from '../src/modules/copiloto/copiloto.cuota.js'

// Mongo en memoria, propio de la suite: nunca toca el Atlas real de
// desarrollo/producción (config/env.js sigue exigiendo MONGO_URI/JWT_SECRET
// en .env para arrancar, pero ningún test se conecta a esa URI).
//
// Replica set de 1 solo nodo (no MongoMemoryServer, un standalone) a
// propósito: Atlas en producción YA opera como replica set (ver MONGO_URI en
// .env.example, replicaSet=atlas-...), y las transacciones multi-documento
// (ver usuarios.service.js#eliminarUsuarioDefinitivamente) solo funcionan
// contra un replica set — un standalone las rechaza con
// "Transaction numbers are only allowed on a replica set member or mongos".
// Un nodo alcanza para la suite: no se necesita tolerancia a fallos aquí,
// solo que el protocolo de transacciones esté disponible.
let replSet

beforeAll(async () => {
  // launchTimeout por encima del default (10s): con varios archivos de test
  // corriendo en paralelo (ver poolOptions en vitest.config.js), el arranque
  // de cada replica set compite por CPU/disco y puede tardar más que en
  // aislamiento.
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    instanceOpts: [{ launchTimeout: 60_000 }],
  })
  await mongoose.connect(replSet.getUri())
})

afterEach(async () => {
  const { collections } = mongoose.connection
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})))

  // El marcapasos de cuota de Gemini (copiloto.cuota.js) cuenta peticiones por
  // minuto en una variable de módulo, así que es estado COMPARTIDO entre tests
  // igual que la base. Sin esto, un archivo que ejercita el copiloto varias
  // veces agota el presupuesto y los tests siguientes fallan con un 429 que no
  // tiene nada que ver con lo que estaban probando. Se limpia junto con las
  // colecciones, por el mismo motivo y en el mismo sitio.
  reiniciarCuota()
})

afterAll(async () => {
  await mongoose.disconnect()
  await replSet.stop()
})
