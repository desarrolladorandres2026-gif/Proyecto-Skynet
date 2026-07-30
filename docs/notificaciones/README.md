# Sistema de notificaciones (email + push)

Servicio transversal de notificaciones para Skynet: correo (nodemailer/SMTP)
y Web Push (VAPID), con preferencias por usuario, múltiples dispositivos por
usuario, cola de reintentos y auditoría de envíos. Este documento cubre
configuración local/producción y las limitaciones reales de compatibilidad.

Para el diseño y las decisiones de arquitectura, ver el diagnóstico en
[`docs/arquitectura/00-diagnostico-arquitectura-actual.md`](../arquitectura/00-diagnostico-arquitectura-actual.md)
(sección "Notificaciones acopladas a un solo módulo") — este sistema es la
resolución de ese cimiento pendiente.

## Arquitectura, en breve

- **Backend** (`Backend/src/modules/notificaciones/`): `notificaciones.service.js`
  es el punto de entrada único (`notificar()`). Encola filas en la colección
  `EnvioNotificacion` (una fila = un intento, un canal, un destinatario) y
  responde de inmediato — el envío real lo hace `notificaciones.worker.js`,
  un `setInterval` en el mismo proceso Node que revisa pendientes cada
  `NOTIF_WORKER_INTERVALO_MS` (por defecto 5s).
- **Cola en MongoDB, no Redis/BullMQ.** Decisión deliberada: el proyecto no
  tiene Redis en ningún otro punto de su infraestructura (solo MongoDB
  Atlas), y el volumen esperado (un ERP interno de una terminal de
  transporte) no lo justifica. Limitación conocida: el worker asume **un
  solo proceso Node activo**. Si el backend llegara a correr en más de una
  instancia (balanceo de carga), dos workers podrían tomar la misma fila
  pendiente y enviarla duplicada — el punto exacto a resolver entonces es
  `procesarPendientes()` en `notificaciones.service.js` (necesitaría un
  claim atómico tipo `findOneAndUpdate` a un estado `procesando`).
- **Preferencias** (`PreferenciaNotificacion`): por usuario, canal
  (email/push) y categoría (`notificaciones.catalogo.js`). Un usuario sin
  documento se trata como "todo activado". Los eventos marcados
  `transaccional: true` (alertas de seguridad) ignoran las preferencias por
  completo — nunca se pueden desactivar.
- **Compatibilidad con lo existente:** `utils/sendPush.js` (`notificarUsuarios`,
  usado por varios sitios en `mantenimiento` y `danos` desde antes de
  este cambio) sigue funcionando igual por fuera, pero ahora corre sobre este
  motor. Los módulos que le pasan una `categoria` (tercer argumento) obtienen
  el comportamiento completo (push + email, según preferencia); los que no
  se la pasan quedan como antes: solo push, sin email, sin opt-out (para no
  sorprender a nadie con correos que nunca existieron).

## Configuración local

1. **Variables de entorno** (`Backend/.env`, copiar de `.env.example`):
   ```
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_SECURE=false
   EMAIL_USER=tu-cuenta@gmail.com
   EMAIL_PASS=xxxx xxxx xxxx xxxx   # app-password, no la contraseña de la cuenta

   VAPID_EMAIL=mailto:tu-cuenta@gmail.com
   VAPID_PUBLIC_KEY=
   VAPID_PRIVATE_KEY=

   API_PUBLIC_URL=http://localhost:3001/api
   NOTIF_WORKER_INTERVALO_MS=5000
   NOTIF_WORKER_LOTE=25
   ```
2. **Generar las claves VAPID** (una vez, se reutilizan siempre):
   ```
   cd Backend
   npx web-push generate-vapid-keys
   ```
   Copia `Public Key`/`Private Key` a `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`.
   Sin estas claves, la suscripción push falla con un mensaje claro (no
   silencioso) tanto en frontend (`vapidPublicKey` vuelve `null`) como si el
   worker intenta enviar sin ellas configuradas.
3. **SMTP en desarrollo:** cualquier proveedor con SMTP sirve (Gmail con
   app-password, Mailtrap, un servidor local). No hay simulación: si
   `EMAIL_HOST` no es alcanzable, el envío falla de verdad y el worker lo
   reintenta con backoff (ver `calcularProximoIntento` en
   `notificaciones.service.js`).
4. **Instalar y correr:**
   ```
   cd Backend && npm install && npm run dev
   cd frontend && npm install && npm run dev
   ```
   El Service Worker (`frontend/src/sw.js`) **no se activa en `npm run dev`**
   — la PWA solo se registra en build/preview (ver el "sw-kill-switch" en
   `vite.config.js`, que además limpia cualquier SW zombie de una versión
   anterior del proyecto en el mismo puerto). Para probar push de punta a
   punta en local:
   ```
   cd frontend && npm run build && npm run preview
   ```
5. **Probar el flujo end-to-end:** con dos usuarios (uno con permiso
   `requerimientos:aprobar_financiero`), crea un Requerimiento desde
   `/requerimientos/nuevo` con el otro usuario. Revisa la colección
   `EnvioNotificacion` en Mongo — deberías ver filas `pendiente` que pasan a
   `enviado` en el siguiente tick del worker.

## Producción

- `API_PUBLIC_URL` y `FRONTEND_URL` deben ser los dominios reales (el
  primero se usa en el enlace de baja de los correos; el segundo, en el
  botón "Ver en Skynet" de la plantilla).
- **Web Push exige HTTPS** (excepto `localhost`, que el navegador trata como
  origen seguro para desarrollo). Sin TLS en el dominio de producción, el
  navegador ni siquiera expone `navigator.serviceWorker`/`PushManager`.
- El worker corre dentro del mismo proceso del backend — no hay un segundo
  proceso/servicio que desplegar aparte. Si el hosting reinicia el proceso
  con frecuencia (cold starts), las notificaciones pendientes simplemente
  esperan al próximo arranque; no se pierden (quedan en Mongo).
- Revisa el límite de envío de tu proveedor SMTP (Gmail, por ejemplo, limita
  envíos/día por cuenta). Si el volumen crece, migrar `EMAIL_HOST`/credenciales
  a un proveedor transaccional (Resend, SES, Postmark, SendGrid) es un
  cambio contenido en `utils/email.js` — el resto del sistema no lo sabe.

## Entregabilidad: por qué los correos caen en spam (y cómo se arregla)

Con la configuración actual (`EMAIL_USER` = una cuenta `@gmail.com` normal
vía SMTP), **es esperable que los correos caigan en spam**, sobre todo al
principio y sobre todo si el destinatario también es Gmail. La causa no está
en el código ni en el diseño del correo: está en que el dominio remitente
(`gmail.com`) no le pertenece al Terminal, así que no se le pueden configurar
los registros de autenticación que los filtros exigen a un remitente
automatizado.

Lo que ya hace el código para ayudar (todo en `utils/email.js` y
`notificaciones.plantillas.js`):

- Remitente con nombre propio: `"Skynet" <cuenta@…>`, no la cuenta pelada.
- Parte `text/plain` además del HTML — un correo solo-HTML es una señal
  negativa fuerte para los filtros.
- Cabeceras `List-Unsubscribe` y `List-Unsubscribe-Post` (RFC 8058), que
  activan el botón nativo de "Cancelar suscripción" de Gmail/Outlook. Ese
  botón pesa a favor de la reputación mucho más que un enlace en el cuerpo;
  requiere el `POST /api/notificaciones/baja` que expone
  `notificaciones.routes.js`.
- Asunto con prefijo estable (`Skynet · …`), que además agrupa mejor los hilos.

**Eso llega hasta cierto punto.** Para entrega confiable en bandeja de
entrada hace falta un dominio propio del Terminal:

1. Elegir un proveedor transaccional (Resend, Brevo, Amazon SES, Postmark).
   Todos tienen plan gratuito suficiente para el volumen de un ERP interno.
2. Verificar el dominio institucional en ese proveedor (p. ej.
   `terminaldetransportedeneiva.com`) y publicar los tres registros DNS que
   te indique:
   - **SPF** (TXT): autoriza a ese proveedor a enviar en nombre del dominio.
   - **DKIM** (TXT/CNAME): firma criptográfica de cada correo.
   - **DMARC** (TXT): política de qué hacer si SPF/DKIM fallan; empieza con
     `p=none` para observar sin bloquear, y endurece a `p=quarantine` después.
3. Cambiar en `Backend/.env`:
   ```
   EMAIL_HOST=smtp.resend.com        # o el del proveedor elegido
   EMAIL_PORT=587
   EMAIL_SECURE=false
   EMAIL_USER=notificaciones@tudominio.com
   EMAIL_PASS=<api-key del proveedor>
   ```
   **No hay que tocar código**: `utils/email.js` ya lee todo de `env`.
4. Enviar poco volumen los primeros días ("warm-up") en vez de una ráfaga
   grande de golpe: un dominio nuevo que de repente manda cientos de correos
   es exactamente el patrón que los filtros castigan.

**Mitigación temporal, mientras tanto:** que cada destinatario marque un
correo de Skynet como "No es spam" y agregue el remitente a sus contactos.
Eso solo entrena el filtro de *esa* cuenta — no arregla el problema para
usuarios nuevos, por eso no sustituye al dominio propio.

## Límites de compatibilidad por navegador/SO

- **iOS/iPadOS Safari:** Web Push solo funciona si la app está **instalada**
  ("Compartir" → "Añadir a pantalla de inicio"), y solo en iOS **16.4+**. En
  una pestaña normal de Safari, `PushManager` no existe — `usePushNotifications`
  lo reporta como `no-soportado` y la pantalla de preferencias no ofrece el
  botón "Activar" en ese caso. `InstallBanner.jsx` ya distingue este caso y
  muestra las instrucciones manuales de instalación en iOS.
- **Android:** funciona tanto en Chrome/Firefox normales como instalada. Los
  fabricantes con gestión de batería agresiva (Xiaomi/MIUI, Huawei, algunos
  Samsung) pueden retrasar o suprimir push si la app no tiene excepción de
  ahorro de batería — no es algo que el código pueda forzar.
- **Escritorio (Windows/macOS/Linux):** Chrome, Edge, Firefox y Safari
  (macOS 13+) soportan Web Push en pestaña normal, sin necesidad de instalar
  la PWA. El SO puede igual enrutar la notificación según su propia
  configuración de "Enfoque"/"No molestar".
- **Ningún navegador garantiza entrega inmediata** con la app cerrada: el
  sistema operativo puede agrupar, retrasar o descartar push bajo ahorro de
  batería. Por eso el correo (canal independiente) sigue siendo el respaldo
  para lo que de verdad importa que llegue.
- Si el usuario **bloquea** el permiso, no hay forma de volver a pedirlo
  por código — `PreferenciasNotificacionesPage` detecta `permiso === 'denied'`
  y muestra instrucciones para reactivarlo manualmente desde el candado de
  la barra de direcciones (o los ajustes de notificaciones del SO).

## Pruebas

```
cd Backend && npm test     # vitest + supertest + mongodb-memory-server
cd frontend && npm test    # vitest + @testing-library/react (jsdom)
```

Además hay dos scripts que envían correo **de verdad** por el SMTP de `.env`
(no son parte de `npm test`, se corren a mano cuando se quiere verificar la
entrega real o revisar el diseño del correo):

```
npm run test:notificaciones        [correo]   # 1 correo por categoría, contenido sintético
npm run test:flujo-notificaciones  [correo]   # recorre los flujos de negocio reales
```

`test:flujo-notificaciones` es la prueba integral: levanta Mongo **en memoria**
(no toca el Atlas real), crea los actores con sus permisos RBAC y ejercita los
servicios de verdad — crear un requerimiento, aprobarlo en Financiero y
Bodega, reportar y resolver un daño, y el ciclo completo de una orden de
trabajo — comprobando en cada transición que se generó el aviso esperado.
Incluye un caso que verifica **silencio** deliberado (pasar un daño a
`en_proceso` no debe notificar a nadie), para que un cambio futuro que empiece
a mandar correos por cada paso intermedio salte en la prueba.

Los actores usan sub-direccionamiento (`tucorreo+financiero@gmail.com`), así
que todos los avisos llegan al mismo buzón pero el campo "Para:" indica a qué
rol iba dirigido cada uno.

Los tests de backend no tocan el Atlas real (Mongo en memoria, ver
`Backend/tests/setup.js`) ni SMTP/push reales (`webpush`/`enviarEmailGenerico`
mockeados). Cubren: resolución de preferencias/categorías, el bypass
transaccional, la compatibilidad de `notificarUsuarios()` legado, limpieza de
suscripciones muertas (404/410) y el backoff de reintentos — y, como flujo de
integración real, el ciclo completo de Requerimientos (creación → aviso a
Financiero → aprobación → aviso a Bodega → decisión → aviso al solicitante).
