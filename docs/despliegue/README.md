# Despliegue en producción — VPS Hostinger (skynetttn.online)

Arquitectura elegida: **todo en un solo VPS**. Nginx sirve el build estático
del frontend y hace de proxy reverso hacia el backend (Express, gestionado
por PM2, escuchando solo en `localhost:3001`). MongoDB sigue en Atlas (nube,
sin cambios). Esto evita el problema de CORS/cookies cross-origin: frontend y
API quedan bajo el mismo dominio (`skynetttn.online` sirve `/`, y
`skynetttn.online/api/*` es el backend detrás del proxy).

```
Internet ──HTTPS──► Nginx (443) ──┬── / (estático)      → frontend/dist
                                   ├── /api/*  (proxy)   → localhost:3001
                                   └── /storage/* (proxy)→ localhost:3001
                                                              │
                                                          PM2 (fork, 1 instancia)
                                                              │
                                                        MongoDB Atlas (nube)
```

## 0. Requisitos previos (ya decididos)

- Dominio `skynetttn.online` apuntando al VPS (registro A en el DNS del
  dominio → IP pública del VPS de Hostinger). **Verifica esto primero**:
  ```bash
  dig +short skynetttn.online
  ```
  Si no devuelve la IP del VPS, el resto de esta guía no funcionará hasta que
  el DNS propague (puede tardar hasta unas horas).
- Acceso SSH al VPS con un usuario con `sudo`.

## 1. Preparar el VPS (una sola vez)

```bash
# Conectado por SSH al VPS:
sudo apt update && sudo apt upgrade -y

# Node.js 22 LTS (el proyecto se desarrolló con Node 25; cualquier LTS ≥ 20 sirve)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx git

# PM2: mantiene el backend corriendo, lo reinicia si crashea, y lo arranca
# solo si el VPS se reinicia.
sudo npm install -g pm2

# Certbot para HTTPS gratis (Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx

# Firewall: solo SSH, HTTP y HTTPS
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## 2. Clonar el repo y configurar variables de entorno

```bash
sudo mkdir -p /var/www/skynet
sudo chown $USER:$USER /var/www/skynet
git clone https://github.com/desarrolladorandres2026-gif/Proyecto-Skynet.git /var/www/skynet
cd /var/www/skynet
mkdir -p logs Backend/storage
```

Backend — copiar la plantilla y rellenar los valores marcados `<...>`
(la mayoría se copian tal cual del `.env` de desarrollo — VAPID keys y
`TOKEN_ENCRYPTION_KEY` **deben** ser los mismos, no generar nuevos):

```bash
cp Backend/.env.production.example Backend/.env
nano Backend/.env
```

Frontend — **no hace falta** `.env` en producción: Nginx sirve frontend y
backend bajo el mismo dominio, así que las peticiones a `/api` son
relativas y no necesitan `VITE_API_URL` (ver `frontend/.env.example`).

## 3. Instalar dependencias y compilar

```bash
cd /var/www/skynet/Backend
npm ci --omit=dev

cd /var/www/skynet/frontend
npm ci
npm run build          # genera frontend/dist
```

## 4. Arrancar el backend con PM2

```bash
cd /var/www/skynet
pm2 start deploy/ecosystem.config.cjs --env production
pm2 save                # persiste la lista de procesos
pm2 startup              # imprime un comando sudo — cópialo y ejecútalo
                          # (registra PM2 como servicio systemd)
```

Verificar que arrancó bien:

```bash
pm2 logs skynet-backend --lines 50
curl http://localhost:3001/health
```

## 5. Configurar Nginx

```bash
sudo cp /var/www/skynet/deploy/nginx/skynetttn.conf /etc/nginx/sites-available/skynetttn.conf
sudo ln -s /etc/nginx/sites-available/skynetttn.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default   # evita que el default de Nginx compita por el puerto 80
sudo nginx -t
sudo systemctl reload nginx
```

En este punto `http://skynetttn.online` ya debería servir el frontend
(sin HTTPS todavía).

## 6. Activar HTTPS

```bash
sudo certbot --nginx -d skynetttn.online -d www.skynetttn.online
```

Certbot edita `/etc/nginx/sites-available/skynetttn.conf` automáticamente
(agrega el bloque 443, redirección 80→443, y renovación automática vía
`systemctl status certbot.timer`).

## 7. Actualizar credenciales que dependían de `localhost`

Estas quedaron con URLs de desarrollo en configuraciones externas — hay que
actualizarlas manualmente ahora que el dominio es real:

- **Google OAuth (módulo Email)**, si está en uso: en
  [Google Cloud Console](https://console.cloud.google.com/) → Credenciales →
  el cliente OAuth existente → agregar
  `https://skynetttn.online/api/email/oauth/gmail/callback` como *Authorized
  redirect URI* (no reemplazar el de localhost, agregar el nuevo — así sigue
  funcionando en desarrollo).
- **Cloudinary**: no depende del dominio, no requiere cambios.

## 8. Poblar RBAC y datos base en la primera puesta en producción

El backend sincroniza el catálogo de módulos/permisos solo al arrancar
(`sincronizarCatalogoSistema`), pero los **datos semilla** (usuarios de
prueba, empresas demo, etc.) son opcionales y se corren a mano:

```bash
cd /var/www/skynet/Backend
npm run seed              # roles + usuarios base (ver INFORME-PROYECTO-SKYNET.md §9)
# npm run seed:operacion  # datos demo (empresas/vehículos/rutas) — evaluar si
#                          # se quiere en producción real o solo en desarrollo
```

**Decide antes de correrlo**: los datos de `seed:operacion` son de
"Transportes Demo S.A.S." — probablemente NO se quieren en el ambiente real
del Terminal. `seed.js` (roles y usuarios) sí es necesario siempre.

## 9. Desplegar cambios futuros

No hay CI/CD todavía — el flujo es manual:

```bash
cd /var/www/skynet
git pull
cd Backend && npm ci --omit=dev && cd ..
cd frontend && npm ci && npm run build && cd ..
pm2 restart skynet-backend
```

Nginx no necesita reiniciarse para cambios de frontend (sirve `dist/`
directo del disco); solo si se toca `deploy/nginx/skynetttn.conf`.

## 10. Pendientes conocidos antes de ir a producción real

- **Cloudinary sin configurar bloquea "Reportar daño"** (responde 503) — ver
  `INFORME-PROYECTO-SKYNET.md` §10. Confirmar que `Backend/.env` en el VPS
  tiene las 3 variables `CLOUDINARY_*`.
- **Email por Gmail SMTP cae en spam a volumen** — aceptado por ahora
  (decisión ya tomada, ver memoria "notificaciones"); migrar a un proveedor
  transaccional (Resend/SES/Postmark) es solo cambiar variables de entorno,
  sin tocar código — instrucciones en `docs/notificaciones/README.md`.
- **Rotar `MONGO_URI`**: si la cadena de conexión actual estuvo alguna vez en
  un commit expuesto, considera rotar la contraseña del usuario de Atlas
  antes de ir a producción real (Atlas → Database Access).
- **Backups de Atlas**: verificar que el cluster tenga backups automáticos
  habilitados (Atlas → Backup) — no hay backup propio del VPS para los datos.
