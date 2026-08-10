# ANEXO TÉCNICO — INVENTARIO COMPLETO

---

## A. ARCHIVOS Y DIRECTORIOS ANALIZADOS

### Backend

```
Backend/
├── src/
│   ├── index.js (94 líneas) — Bootstrap + middlewares globales
│   ├── config/
│   │   ├── db.js — Conexión MongoDB
│   │   ├── env.js — Validación variables
│   │   └── cloudinary.js (125 líneas) — Upload funciones
│   ├── middleware/
│   │   ├── auth.js — verificarToken()
│   │   ├── permisos.js — requierePermiso()
│   │   └── rateLimit.js — Rate limiting por endpoint
│   ├── models/
│   │   ├── Usuario.js (62 líneas)
│   │   ├── Rol.js
│   │   ├── Permiso.js
│   │   ├── ReporteDano.js (116 líneas)
│   │   ├── Requerimiento.js (149 líneas)
│   │   ├── Ausencia.js
│   │   ├── RegistroAuditoria.js
│   │   ├── EnvioNotificacion.js
│   │   ├── PushSubscription.js
│   │   ├── PreferenciaNotificacion.js
│   │   ├── EmailCuenta.js
│   │   ├── EmailConexionSolicitud.js
│   │   ├── ConversacionCopiloto.js (51 líneas, limit 50 msg)
│   │   ├── MemoriaCopiloto.js
│   │   ├── PreferenciaIA.js
│   │   ├── ConfiguracionIA.js
│   │   ├── AvisoIA.js (TTL 30 días)
│   │   ├── ModuloSistema.js
│   │   └── mantenimiento/
│   │       ├── Equipo.js
│   │       ├── Mantenimiento.js
│   │       ├── TipoEquipo.js
│   │       ├── Marca.js
│   │       └── [más modelos TI legados]
│   ├── modules/
│   │   ├── auth/ — Login, JWT, reset password
│   │   ├── usuarios/ — CRUD usuarios
│   │   ├── roles/ — RBAC dinámico
│   │   ├── permisos/ — Catálogo permisos
│   │   ├── auditoria/ — Logs
│   │   ├── danos/ — Reportes daños + Cloudinary upload
│   │   ├── requerimientos/ — Compra/Servicio
│   │   ├── ausencias/ — Vacaciones
│   │   ├── mantenimiento/ — TI legado
│   │   ├── ordenes/ — Órdenes de trabajo Fase 3
│   │   ├── email/ — Gmail OAuth
│   │   ├── copiloto/ — Gemini IA
│   │   ├── ia/ — Configuración IA
│   │   ├── notificaciones/ — Queue email/push
│   │   ├── perfil/ — Firma usuario
│   │   ├── sistema/ — Módulos activos
│   │   └── operacion/ — Dashboard
│   ├── routes/
│   │   └── index.js — Montaje de módulos
│   ├── utils/
│   │   ├── password.js (38 líneas) — bcrypt + validación
│   │   ├── cifrado.js (39 líneas) — AES-256-GCM
│   │   ├── webpush.js — VAPID + envío notificaciones
│   │   └── emailPlantillasTransaccionales.js — HTML emails
│   ├── middleware/ — mantenimiento/upload.js (20 MB limit PDF)
│   ├── scripts/
│   │   ├── seed.js — RBAC base
│   │   └── migrate-mysql-to-mongo.js
│   ├── storage/ — Almacenamiento local
│   │   ├── mantenimientos/ (20 MB PDFs)
│   │   └── mantenimiento_evidencias/ (50 MB fotos/videos)
│   └── tests/ — Unitarios
│
├── .env (77 líneas) — VERSIONADO, INSEGURO ⚠️
├── .env.example — Plantilla
├── .env.production.example — Plantilla producción
├── package.json — Dependencies
├── package-lock.json
└── node_modules/ (450 MB)
```

### Frontend

```
frontend/
├── src/
│   ├── App.jsx — Enrutamiento principal
│   ├── main.jsx
│   ├── sw.js — Service Worker (Workbox + Vosk precache logic)
│   ├── api/
│   │   └── client.js — Fetch base + localStorage usuario
│   ├── auth/
│   │   ├── AuthContext.jsx (contexto global)
│   │   ├── LoginPage.jsx
│   │   └── ProtectedRoute.jsx
│   ├── config/
│   │   ├── env.js
│   │   └── modulosRegistry.js (registro único menú + RBAC)
│   ├── modules/ (15+ módulos)
│   │   ├── danos/ — ReportarDanoPage
│   │   ├── requerimientos/ — Formularios compra/servicio
│   │   ├── ausencias/ — Calendario + bandeja
│   │   ├── mantenimiento/ — Equipos + órdenes
│   │   ├── email/ — Gmail integration
│   │   ├── ia/ — Configuración IA
│   │   ├── copiloto/ — Chat Gemini
│   │   ├── usuarios/ — CRUD
│   │   ├── roles/ — RBAC
│   │   ├── auditoria/ — Logs
│   │   ├── sistema/ — Módulos on/off
│   │   ├── operacion/ — Dashboard
│   │   ├── induccion/ — Cursos (HTML con emojis)
│   │   ├── notificaciones/ — Preferencias
│   │   └── escritorio/ — Asistente voz
│   ├── components/
│   │   ├── copiloto/
│   │   │   ├── CopilotoWidget.jsx
│   │   │   ├── VoiceOrb.jsx (Vosk WebAssembly, 5.8 MB)
│   │   │   └── [10+ componentes IA]
│   │   ├── ui/ — Componentes generales
│   │   └── dashboard/ — Stat cards, trends
│   ├── layout/
│   │   ├── AppShell.jsx
│   │   ├── AppLayout.jsx
│   │   ├── MobileShell.jsx
│   │   └── HomeRedirect.jsx
│   ├── pwa/
│   │   ├── InstallBanner.jsx
│   │   ├── usePushNotifications.js
│   │   └── PushOnboardingPrompt.jsx
│   └── styles/ — Tailwind
│
├── public/
│   ├── pwa-192x192.png
│   ├── pwa-512x512.png
│   └── manifest.json
│
├── vite.config.js — Vite + PWA + proxy /api
├── tailwind.config.js
├── package.json
├── package-lock.json
└── node_modules/ (500 MB)
```

### Configuración y Documentos

```
docs/
├── despliegue/
│   └── README.md (187 líneas) — Deployment guía
├── arquitectura/
│   ├── README.md — Fases implementadas
│   ├── 00-diagnostico-arquitectura-actual.md
│   ├── 01-talento-humano.md
│   ├── 02-copiloto-voz.md
│   ├── 03-skynet-tool-engine.md
│   └── 04-asistente-escritorio.md
└── notificaciones/
    └── README.md

deploy/
├── ecosystem.config.cjs — PM2 config
├── nginx/
│   └── skynetttn.conf — Nginx config
└── systemd/ — Services (si aplica)
```

---

## B. MODELOS ENCONTRADOS (19 Colecciones + Legado)

### Base Models

| Modelo | Archivo | Docs | Tamaño Prom | Índices | Sensible |
|--------|---------|------|-------------|---------|----------|
| Usuario | src/models/Usuario.js | 50-200 | 1.5 KB | 0 | password, email |
| Rol | src/models/Rol.js | 10-20 | 2 KB | 1 | - |
| Permiso | src/models/Permiso.js | 50-100 | 0.5 KB | 1 | - |
| PasswordResetToken | src/models/PasswordResetToken.js | 0-50 | 0.8 KB | TTL | token |
| RegistroAuditoria | src/models/RegistroAuditoria.js | Miles | 1 KB | 2 | - |
| EnvioNotificacion | src/models/EnvioNotificacion.js | 10000 | 1.2 KB | 2 | emailDestino |
| PushSubscription | src/models/PushSubscription.js | 50-500 | 2 KB | 1 | endpoint |
| PreferenciaNotificacion | src/models/PreferenciaNotificacion.js | 50-200 | 1 KB | 0 | - |
| EmailCuenta | src/models/EmailCuenta.js | 0-50 | 1.5 KB | 1 | refreshTokenCifrado |
| EmailConexionSolicitud | src/models/EmailConexionSolicitud.js | 0-50 | 1.2 KB | 1 | token |
| ReporteDano | src/models/ReporteDano.js | 100-500 | 3 KB | 3 | foto.url |
| Requerimiento | src/models/Requerimiento.js | 200-1000 | 5 KB | 3 | firma |
| Ausencia | src/models/Ausencia.js | 100-1000 | 2.5 KB | 2 | soporte.url |
| ConversacionCopiloto | src/models/ConversacionCopiloto.js | 100-1000 | 8 KB | 1 | - |
| MemoriaCopiloto | src/models/MemoriaCopiloto.js | 50-200 | 2 KB | 0 | - |
| PreferenciaIA | src/models/PreferenciaIA.js | 50-200 | 1 KB | 0 | - |
| ConfiguracionIA | src/models/ConfiguracionIA.js | 50-200 | 1 KB | 0 | - |
| AvisoIA | src/models/AvisoIA.js | Miles (TTL 30d) | 0.8 KB | 2 (TTL) | - |
| ModuloSistema | src/models/ModuloSistema.js | 15-20 | 0.5 KB | 0 | - |
| **[Legado TI]** | src/models/mantenimiento/ | Cientos | 2-5 KB | Varios | - |

---

## C. ENDPOINTS Y RUTAS

### Auth
```
POST   /api/auth/login                  — Login
POST   /api/auth/logout                 — Logout
POST   /api/auth/refresh                — Refresh token
POST   /api/auth/reset-password/request — Pedir reset
POST   /api/auth/reset-password/confirm — Confirmar reset
GET    /api/auth/me                     — Usuario actual
```

### Usuarios
```
GET    /api/usuarios                    — Listar (con pagination)
POST   /api/usuarios                    — Crear
GET    /api/usuarios/:id                — Detalle
PUT    /api/usuarios/:id                — Editar
DELETE /api/usuarios/:id                — Eliminar
```

### Roles/Permisos
```
GET    /api/roles                       — Listar roles
POST   /api/roles                       — Crear rol
PUT    /api/roles/:id                   — Editar
DELETE /api/roles/:id                   — Eliminar (si no sistema)
GET    /api/permisos                    — Catálogo permisos
```

### Daños
```
GET    /api/danos                       — Listar reportes
POST   /api/danos/reportar              — Crear + upload foto
GET    /api/danos/:id                   — Detalle
PUT    /api/danos/:id/estado            — Cambiar estado
POST   /api/danos/:id/asignar           — Asignar técnico
DELETE /api/danos/:id                   — Eliminar (+ Cloudinary)
```

### Requerimientos
```
GET    /api/requerimientos              — Listar
POST   /api/requerimientos              — Crear
GET    /api/requerimientos/:id          — Detalle
PUT    /api/requerimientos/:id          — Editar
PUT    /api/requerimientos/:id/aprobar  — Financiero aprueba
PUT    /api/requerimientos/:id/bodega   — Bodega aprueba
DELETE /api/requerimientos/:id          — Eliminar
```

### Ausencias
```
GET    /api/ausencias                   — Listar
POST   /api/ausencias                   — Crear
GET    /api/ausencias/:id               — Detalle
POST   /api/ausencias/:id/soporte       — Upload soporte
PUT    /api/ausencias/:id/revisar       — Revisar
DELETE /api/ausencias/:id               — Cancelar
```

### Email (Gmail)
```
GET    /api/email/conectar              — OAuth step 1
GET    /api/email/oauth/gmail/callback  — OAuth step 2
GET    /api/email/bandeja               — Listar entrada
GET    /api/email/buscar                — Buscar correos
GET    /api/email/mensaje/:id           — Detalle
POST   /api/email/enviar                — Enviar email
```

### Copiloto IA
```
POST   /api/copiloto/chat               — Mensaje a Gemini
GET    /api/copiloto/historial          — Conversaciones
DELETE /api/copiloto/historial/:id      — Borrar conversación
```

### Notificaciones
```
GET    /api/notificaciones/preferencias — Mis preferencias
PUT    /api/notificaciones/preferencias — Actualizar
POST   /api/notificaciones/suscribir    — Suscribir push
POST   /api/notificaciones/desuscribir  — Desuscribir push
```

### Sistema
```
GET    /api/sistema/modulos             — Módulos activos
PUT    /api/sistema/modulos/:key        — Activar/desactivar
```

### Mantenimiento (Legacy)
```
GET    /api/mantenimiento/equipos       — Listar equipos TI
POST   /api/mantenimiento/ordenes       — Crear orden
POST   /api/mantenimiento/ordenes/:id/evidencias — Upload con multer (50 MB)
```

---

## D. SERVICIOS EXTERNOS Y CONFIGURACIÓN

### MongoDB Atlas

| Parámetro | Valor |
|-----------|-------|
| **Proveedor** | MongoDB (SaaS) |
| **Cluster** | ttn (3 nodos replica set) |
| **Base de datos** | Skynet |
| **Usuario** | prensattn_db_user |
| **Host SRV** | ttn.oufx0bv.mongodb.net |
| **Puerto** | 27017 (default SSL) |
| **SSL/TLS** | Obligatorio |
| **Backup** | Automático (35 días retención) |
| **URL ejemplo** | mongodb+srv://prensattn_db_user:***@ttn.oufx0bv.mongodb.net/Skynet |

### Cloudinary

| Parámetro | Valor |
|-----------|-------|
| **Proveedor** | Cloudinary (CDN + Storage) |
| **Cloud Name** | nwmji7hb |
| **Carpetas** | skynet/reportes, skynet/firmas, skynet/ausencias |
| **Transformaciones** | 1600x1600 limit, quality:auto:good |
| **Plan** | Free (10 GB) o Pro ($99/mes) — no determinable en código |
| **Métodos usados** | upload_stream(), destroy() |

### Resend (Email Transaccional)

| Parámetro | Valor |
|-----------|-------|
| **Proveedor** | Resend (SMTP) |
| **Host** | smtp.resend.com |
| **Puerto** | 587 (TLS) |
| **Usuario** | resend (literal) |
| **From Domain** | skynetttn.online (verificado) |
| **Uso** | Reset password, notificaciones sistema |

### Google Gemini (IA)

| Parámetro | Valor |
|-----------|-------|
| **Proveedor** | Google AI Studio |
| **Modelo** | gemini-flash-lite-latest |
| **API Key** | (redactado — ver gestor de secretos) (free tier) |
| **Rate Limit** | 15 req/min (free), pagado si más |
| **Temperatura** | 0.4 (respuestas determinísticas) |
| **Max Tokens** | 700 respuesta |
| **Tool Calling** | Sí (búsqueda web, cálculos, etc.) |

### Google OAuth (Gmail)

| Parámetro | Valor |
|-----------|-------|
| **Proveedor** | Google Cloud Console |
| **Proyecto** | skynet-ttn |
| **Client ID** | 996087477007-asvfd8kj1u2rs3r81tq07d6cgugm09ms.apps.googleusercontent.com |
| **Scopes** | gmail.readonly, gmail.modify |
| **Redirect URI** | http://localhost:3001/api/email/oauth/gmail/callback |

### Web Push (Notificaciones)

| Parámetro | Valor |
|-----------|-------|
| **Estándar** | Web Push Protocol (RFC 8030) |
| **Public Key** | BA0svQ84fmp32ZQD9E9Buo7CmfLsmaab6LW6Bl3rEsOmh-mI5imkv4xLr0YiAOa8AWBmCHEN0xQc-GQ07L3rLe0 |
| **Private Key** | (redactado — ver gestor de secretos) |
| **Email Contacto** | mailto:desarrolladorandres2026@gmail.com |
| **Nota** | MISMAS keys que sigittn-backend original |

---

## E. VARIABLES DE ENTORNO CRÍTICAS

### Expuestas ⚠️

```
MONGO_URI=mongodb+srv://prensattn_db_user:***@ttn.oufx0bv.mongodb.net/Skynet
JWT_SECRET=<redactado — ver gestor de secretos>
TOKEN_ENCRYPTION_KEY=<redactado — ver gestor de secretos>
CLOUDINARY_API_KEY=<redactado — ver gestor de secretos>
CLOUDINARY_API_SECRET=<redactado — ver gestor de secretos>
GEMINI_API_KEY=<redactado — ver gestor de secretos>
GOOGLE_CLIENT_SECRET=<redactado — ver gestor de secretos>
EMAIL_PASS=<redactado — ver gestor de secretos>
VAPID_PRIVATE_KEY=<redactado — ver gestor de secretos>
```

### No Sensibles

```
PORT=3001
CORS_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173
API_PUBLIC_URL=http://localhost:3001/api
STORAGE_ROOT=./storage
FILES_PUBLIC_URL=http://localhost:3001/storage
CLOUDINARY_CLOUD_NAME=nwmji7hb
NOTIF_WORKER_INTERVALO_MS=5000
NOTIF_WORKER_LOTE=25
VAPID_EMAIL=mailto:desarrolladorandres2026@gmail.com
VAPID_PUBLIC_KEY=BA0svQ84fmp32ZQD9E9Buo7CmfLsmaab6LW6Bl3rEsOmh-mI5imkv4xLr0YiAOa8AWBmCHEN0xQc-GQ07L3rLe0
```

---

## F. PROCESOS DE ALMACENAMIENTO

### Upload Foto Daño
```
1. Frontend → FormData {foto}
2. Backend: multer memoryStorage, validate <1MB
3. cloudinary.uploader.upload_stream({
     folder: 'skynet/reportes',
     transformation: [{width: 1600, height: 1600, crop: 'limit', quality: 'auto:good'}]
   })
4. MongoDB: ReporteDano {foto: {url, publicId}}
5. Resultado: ~60-200 KB en Cloudinary
```

### Upload PDF Mantenimiento
```
1. Frontend → FormData {pdf}
2. Backend: multer diskStorage, validate <20MB, PDF only
3. fs.writeFile → /storage/mantenimientos/[timestamp]_[name].pdf
4. MongoDB: Mantenimiento {pdf: {path, size}}
5. Resultado: Archivo en VPS disco
```

### Notificación Email
```
1. Evento en sistema (requerimiento aprobado)
2. Backend: Crea EnvioNotificacion {estado: 'pendiente'}
3. Worker (cada 5s): Busca pendientes, toma lote 25
4. Nodemailer SMTP: smtp.resend.com:587
5. Actualiza: {estado: 'enviado', enviadoEn: Date}
```

### Notificación Push
```
1. Frontend: pushSubscription.subscribe() registra endpoint
2. MongoDB: PushSubscription {usuario, endpoint, auth, p256dh}
3. Evento del sistema: Crea EnvioNotificacion {canal: 'push'}
4. Backend: webpush.sendNotification(subscription, payload)
5. Browser Service Worker: Recibe "push", muestra notificación
```

---

## G. DEPENDENCIAS CRÍTICAS

### Backend (principales)

```
"dependencies": {
  "express": "^4.19.2",
  "mongoose": "^8.5.0",
  "jsonwebtoken": "^9.0.2",
  "bcryptjs": "^2.4.3",
  "cloudinary": "^2.10.0",
  "googleapis": "^174.0.1",
  "web-push": "^3.6.7",
  "@google/generative-ai": "^2.15.0",
  "nodemailer": "^9.0.3",
  "dotenv": "^16.4.4",
  "cors": "^2.8.5",
  "helmet": "^8.3.0",
  "express-mongo-sanitize": "^2.2.0",
  "express-rate-limit": "^8.6.1",
  "multer": "^1.4.5",
  "pm2": "^5.4.0"
}
```

### Frontend (principales)

```
"dependencies": {
  "react": "^19.2.7",
  "react-router-dom": "^7.0.1",
  "axios": "^1.7.2",
  "react-redux": "^9.1.2",
  "@reduxjs/toolkit": "^2.0.1",
  "tailwindcss": "^4.3.3",
  "lucide-react": "^latest",
  "vite": "^8.1.1",
  "vite-plugin-pwa": "^1.2.0",
  "workbox-precaching": "^7.3.0"
}
```

---

## H. LIMITES CÓDIGO IMPLEMENTADOS

| Límite | Ubicación | Valor |
|--------|-----------|-------|
| JSON payload | Backend/src/index.js:40 | 1 MB |
| Ausencias upload | Backend/src/modules/ausencias/ausencias.routes.js:22 | 10 MB |
| Mantenimiento PDF | Backend/src/modules/mantenimiento/upload.js:24 | 20 MB |
| Foto redimensión | Backend/src/config/cloudinary.js:19 | 1600x1600 |
| Conversación historial | Backend/src/models/ConversacionCopiloto.js:51 | 50 mensajes |
| Notificaciones lote | Backend/.env:NOTIF_WORKER_LOTE | 25/iteración |
| Gemini rate limit | Código copiloto | 12 req/min (free) |
| JWT expiración | Backend/.env:JWT_EXPIRES_IN | 8 horas |
| Bcrypt rounds | Backend/src/utils/password.js | 12 |
| Password mínimo | Backend/src/utils/password.js | 12 caracteres |
| Push historial | Backend/.env:NOTIF_WORKER_INTERVALO_MS | 5000 ms |

---

**Fin del Anexo Técnico**

Generado: 10 de agosto de 2026

