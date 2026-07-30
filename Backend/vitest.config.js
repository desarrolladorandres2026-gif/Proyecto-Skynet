import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    // mongodb-memory-server descarga el binario de Mongo la primera vez:
    // más lento que el resto de la suite, así que el timeout por defecto
    // (5s) no alcanza en la primera corrida en una máquina nueva.
    testTimeout: 30000,
    hookTimeout: 60000,
  },
})
