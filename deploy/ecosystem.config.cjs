// Config de PM2 para el Backend en el VPS de Hostinger.
// Uso: pm2 start deploy/ecosystem.config.cjs --env production
//      pm2 save && pm2 startup   (una sola vez, para que sobreviva a reinicios del VPS)
module.exports = {
  apps: [
    {
      name: 'skynet-backend',
      cwd: __dirname + '/../Backend',
      script: 'src/index.js',
      interpreter: 'node',
      // Un solo proceso: el worker de notificaciones vive dentro del mismo
      // proceso Express (ver notificaciones.worker.js), así que correr en modo
      // cluster con varias instancias duplicaría el envío de notificaciones.
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '400M',
      out_file: '../logs/backend-out.log',
      error_file: '../logs/backend-error.log',
      time: true,
    },
  ],
}
