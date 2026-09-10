import swaggerJsdoc from 'swagger-jsdoc'

// Documentación generada a partir de anotaciones JSDoc (@openapi) en los
// archivos de rutas. Empieza cubriendo /auth como referencia del formato;
// el resto de módulos se van agregando incrementalmente sin tocar este
// archivo (basta con anotar el router correspondiente, ver auth.routes.js).
const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Skynet API',
      version: '1.0.0',
      description: 'Documentación de la API del backend de Skynet (ERP interno).',
    },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
        },
      },
    },
  },
  apis: ['./src/modules/**/*.routes.js'],
}

export const swaggerSpec = swaggerJsdoc(options)
