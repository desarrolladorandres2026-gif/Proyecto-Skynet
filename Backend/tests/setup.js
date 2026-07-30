import { beforeAll, afterEach, afterAll } from 'vitest'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'

// Mongo en memoria, propio de la suite: nunca toca el Atlas real de
// desarrollo/producción (config/env.js sigue exigiendo MONGO_URI/JWT_SECRET
// en .env para arrancar, pero ningún test se conecta a esa URI).
let mongod

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
})

afterEach(async () => {
  const { collections } = mongoose.connection
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})
