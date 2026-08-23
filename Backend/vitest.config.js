import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    // mongodb-memory-server descarga el binario de Mongo la primera vez:
    // más lento que el resto de la suite, así que el timeout por defecto
    // (5s) no alcanza en la primera corrida en una máquina nueva.
    testTimeout: 30000,
    hookTimeout: 90000,
    // Cada archivo de test levanta su propio replica set de 1 nodo en
    // memoria (ver tests/setup.js) — necesario para que las transacciones
    // multi-documento funcionen en las pruebas, igual que en producción
    // (Atlas ya opera como replica set). Arrancar un replica set es más
    // pesado que un Mongo standalone; sin límite, Vitest intenta correr
    // decenas de archivos en paralelo y todos esos arranques a la vez
    // saturan el timeout de 10s de mongodb-memory-server bajo carga. Limitar
    // cuántos archivos corren a la vez evita ese cuello de botella sin
    // perder el paralelismo por completo.
    poolOptions: {
      threads: {
        maxThreads: 2,
        minThreads: 1,
      },
    },
  },
})
