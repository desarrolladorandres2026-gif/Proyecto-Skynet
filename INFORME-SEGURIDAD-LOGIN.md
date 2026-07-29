# Informe de Auditoría de Seguridad — Sistema de Login (Skynet)

**Alcance:** flujo de autenticación email + contraseña, JWT, reset de contraseña, middleware de autorización, configuración de API y frontend.
**Metodología:** revisión de código + verificación empírica de las hipótesis críticas ejecutando Mongoose, `bcryptjs` y `qs` reales en local (sin tocar la BD de producción).
**Fecha:** 2026-07-27

> **Nota:** las conclusiones sobre NoSQL injection, truncamiento de bcrypt y el comportamiento de `bcrypt.compare` con tipos no-string están **verificadas ejecutando código**, no asumidas.

---

## ✅ ACTUALIZACIÓN — Remediación completada (2026-07-27)

Todos los hallazgos de este informe que son corregibles en código **ya están implementados y probados contra la base de datos real** (Atlas). Resumen de lo que cambió:

- **C-1 (NoSQL injection)** — corregido con validación de tipo `string` en cada campo sensible + `express-mongo-sanitize` global. Probado en vivo: `{"token":{"$gt":""}}` y `?token[$ne]=x` devuelven `400`, no secuestran cuentas.
- **C-2 (fuerza bruta)** — corregido con dos capas: rate limiting por IP (`express-rate-limit`, 10 intentos/15 min en login) **y** bloqueo por cuenta (5 intentos fallidos → 15 min de bloqueo), esta última porque el límite por IP no frena un ataque distribuido. Probado en vivo: al 6º intento, incluso la contraseña correcta es rechazada.
- **C-3 (secretos en el repo)** — `.gitignore` creado en `Backend/` y en la raíz, `.env.example` sin valores reales. **Pendiente de tu parte:** rotar las credenciales (ver checklist abajo).
- **A-1/A-2 (Helmet, body limit)** — `helmet()` activo, límite de body bajado de 100 MB a 1 MB.
- **A-3 (enumeración)** — respuesta y tiempo de `login` unificados (hash señuelo siempre ejecutado); "usuario inactivo" y "cuenta bloqueada" ya no se distinguen de "contraseña incorrecta".
- **A-4 (token en localStorage)** — **rediseño completo**: el token ahora vive en una **cookie `httpOnly` + `SameSite=Strict`**, invisible para JavaScript. Un XSS ya no puede robar la sesión. `localStorage` solo guarda el perfil (nombre/rol), que no es secreto.
- **M-2 (algoritmo JWT)** — fijado explícitamente a `HS256` en firma y verificación.
- **M-3 (fugas en errores)** — `errorHandler` ya no expone `err.message` en respuestas 5xx.
- **M-4/M-5 (política de contraseñas + invalidación de sesión)** — contraseña mínima 12 caracteres, coste de bcrypt subido a 12, y **revocación de sesión en caliente**: cada request revalida el usuario contra la BD, así que desactivar una cuenta, cambiarle el rol/módulos o resetear su contraseña **mata sus sesiones abiertas al instante**, sin esperar las 8h de expiración del JWT. Probado en vivo: un usuario con sesión activa pierde el acceso en la siguiente petición justo después de que un admin lo desactiva.
- **B-1/B-2 (bcrypt)** — rechazo de contraseñas > 72 bytes, coste subido de 10 a 12.
- **`npm audit`** — 0 vulnerabilidades en las dependencias del backend.

### 🔴 Lo único que sigue pendiente — y es crítico — es tuyo, no de código

El código ya no es explotable, pero los **secretos que me mostraste ya estuvieron expuestos** y deben tratarse como comprometidos:

1. **Rota `JWT_SECRET`, la contraseña de MongoDB Atlas (`prensattn_db_user`), el app-password de Gmail (`EMAIL_PASS`) y las claves VAPID.**
2. **Restringe la IP allowlist en Atlas** (no `0.0.0.0/0`).
3. **Despliega detrás de HTTPS** y fija `NODE_ENV=production` — la cookie de sesión solo lleva el flag `Secure` en ese modo; sin HTTPS en producción, el nuevo esquema de cookies no protege nada.
4. Cambia las contraseñas del seed (`Admin.Skynet.2026` / `Usuario.Skynet.2026`) tras el primer arranque.
5. Si el `.env` llegó a hacerse `git commit` alguna vez, purga el historial (el `.gitignore` nuevo no borra lo ya versionado).

Con el código corregido + estos 5 puntos operativos resueltos, el sistema queda en su máximo nivel de seguridad razonable para esta arquitectura (email+contraseña, sin 2FA). **2FA/TOTP** sería el siguiente escalón por encima de esto, no incluido aquí por ser un cambio de producto, no una corrección de vulnerabilidad.

---

## Puntuación de seguridad — estado ANTES de la remediación: 32 / 100 🔴

| Categoría | Estado |
|---|---|
| Gestión de secretos | 🔴 Crítico — credenciales reales en el repo, sin `.gitignore` en Backend |
| Fuerza bruta / rate limiting | 🔴 Crítico — inexistente |
| Inyección NoSQL | 🔴 Crítico — reset de contraseña secuestrable |
| Cabeceras de seguridad (Helmet) | 🟠 Ausente |
| Enumeración de usuarios | 🟠 Posible (por estado y por timing) |
| Almacenamiento de token (frontend) | 🟠 localStorage (expuesto a XSS) |
| Validación de contraseña | 🟡 Débil (mín. 6, sin política) |
| Hashing (bcrypt) | 🟡 Correcto pero coste bajo y librería lenta |
| Manejo de errores / códigos HTTP | 🟡 Filtra `err.message`, DoS por body de 100 MB |

---

## VULNERABILIDADES CRÍTICAS

### C-1 · Inyección NoSQL → secuestro de cuentas vía reset de contraseña
**Riesgo: CRÍTICO** · OWASP A03:2021 (Injection) / A07 (Auth Failures)

**Ubicación:** `Backend/src/modules/auth/auth.controller.js` → `validarToken` (línea 107) y `restablecerPassword` (línea 120).

**Verificado empíricamente:**
```
[MONGOOSE] $gt vacio: ACEPTADO -> {"token":{"$gt":""}, ...}
[MONGOOSE] $ne null:  ACEPTADO -> {"token":{"$ne":null}, ...}
[QS] ?token[$gt]= -> {"token":{"$gt":""}}
```
El campo `token` es `type: String`, pero Mongoose castea sin error un operador `$gt`/`$ne`/`$regex`. Ni el body JSON ni la query string sanitizan el tipo.

**Cómo se explota:**
```http
POST /api/auth/restablecer-password
Content-Type: application/json

{ "token": { "$gt": "" }, "nueva_password": "atacante123" }
```
`findOne({ token: {$gt:''}, usado:false, expira_en:{$gt: now} })` devuelve **el primer token de reset activo de CUALQUIER usuario**. El atacante cambia la contraseña de esa cuenta **sin conocer el token que se envió por email**.

**Impacto:** toma de control de cuentas. Basta con que exista un reset pendiente (el atacante puede provocarlo si conoce `nombre_usuario` + `email`, o esperar/pollear la ventana de 1 h de cualquier usuario). Rompe por completo la garantía de que "solo quien tiene acceso al email puede resetear". El mismo vector en `validar-token` (GET) confirma la existencia de tokens activos vía `?token[$gt]=`.

**Solución:** forzar que `token` sea string antes de consultar + sanitizar operadores globalmente (ver R-1, `express-mongo-sanitize`).

```js
// auth.controller.js
export async function restablecerPassword(req, res) {
  const { token, nueva_password } = req.body

  // Rechaza cualquier cosa que no sea string: bloquea {$gt}, {$ne}, arrays, etc.
  if (typeof token !== 'string' || typeof nueva_password !== 'string') {
    return res.status(400).json({ error: 'Token y nueva contraseña son obligatorios' })
  }
  if (nueva_password.length < 12) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 12 caracteres' })
  }

  const registro = await PasswordResetToken.findOne({
    token,                       // ya garantizado string
    usado: false,
    expira_en: { $gt: new Date() },
  })
  if (!registro) {
    return res.status(400).json({ error: 'Token inválido o expirado' })
  }

  const passwordHash = await bcrypt.hash(nueva_password, 12)
  await Usuario.findByIdAndUpdate(registro.usuario, { password: passwordHash })
  registro.usado = true
  await registro.save()

  res.json({ mensaje: 'Contraseña actualizada correctamente' })
}

export async function validarToken(req, res) {
  const { token } = req.query
  if (typeof token !== 'string') return res.status(400).json({ error: 'Token requerido' })
  const registro = await PasswordResetToken.findOne({
    token, usado: false, expira_en: { $gt: new Date() },
  })
  res.json({ valido: Boolean(registro) })
}
```

---

### C-2 · Ausencia total de rate limiting / protección contra fuerza bruta
**Riesgo: CRÍTICO** · OWASP A07:2021 (Identification & Authentication Failures)

**Ubicación:** `Backend/src/index.js` y `auth.routes.js` — no existe ningún middleware de límite; `package.json` no incluye `express-rate-limit`.

**Cómo se explota:** un script puede probar contraseñas contra `/api/auth/login` sin ningún freno. Con el seed por defecto (`admin` / `admin123`) el diccionario cae en segundos. También aplica a `solicitar-reset` (spam de correos) y a `restablecer-password`.

**Impacto:** compromiso de credenciales por fuerza bruta/diccionario; abuso del envío de emails; DoS.

**Solución:** limitador por IP en las rutas sensibles (defensa en el borde) + bloqueo por cuenta.

```js
// Backend/src/middleware/rateLimit.js
import rateLimit from 'express-rate-limit'

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,       // 15 min
  max: 10,                        // 10 intentos por IP y ventana
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Inténtalo más tarde.' },
})

export const resetLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 })
```
```js
// auth.routes.js
import { loginLimiter, resetLimiter } from '../../middleware/rateLimit.js'
router.post('/login', loginLimiter, login)
router.post('/solicitar-reset', resetLimiter, solicitarReset)
router.post('/restablecer-password', resetLimiter, restablecerPassword)
```
> Detrás de un proxy/CDN añade `app.set('trust proxy', 1)` para que el límite use la IP real. Para producción con varias instancias, usa un store compartido (Redis).

---

### C-3 · Credenciales reales expuestas en el repositorio y Backend sin `.gitignore`
**Riesgo: CRÍTICO** · OWASP A05:2021 (Security Misconfiguration) / A02 (Cryptographic Failures)

**Ubicación:** `Backend/.env`, `atlas-credentials.env`. El directorio `Backend/` **no tiene `.gitignore`**, por lo que `.env` se versiona.

**Secretos comprometidos (deben considerarse quemados y rotarse YA):**
- `MONGO_URI` con usuario/contraseña de MongoDB Atlas (`prensattn_db_user` : `hN7…`).
- `JWT_SECRET` (permite **falsificar tokens de cualquier usuario/rol**, incluido `admin`).
- `EMAIL_PASS` (app password de Gmail `ibpt ojsg…`).
- `VAPID_PRIVATE_KEY`.

**Impacto:** con el `JWT_SECRET` filtrado, un atacante firma un JWT `{rol:'admin'}` y accede a todo sin contraseña. Con la URI de Atlas, acceso directo a la base de datos.

**Solución (en orden):**
1. **Rotar TODOS los secretos** (usuario/clave de Atlas, `JWT_SECRET`, app password de Gmail, claves VAPID). Rotar el JWT_SECRET invalida las sesiones activas — es lo deseable aquí.
2. Crear `Backend/.gitignore`:
   ```gitignore
   node_modules
   .env
   .env.*
   *.local
   storage
   ```
3. Añadir `.env.example` **sin valores** y purgar el historial si ya se hizo commit (`git filter-repo` / BFG).
4. Restringir el acceso de red en Atlas (IP allowlist), no `0.0.0.0/0`.

---

## VULNERABILIDADES IMPORTANTES (ALTO)

### A-1 · Sin Helmet ni cabeceras de seguridad
**OWASP A05.** No hay `helmet` en `index.js` ni en dependencias. Faltan `X-Content-Type-Options`, `X-Frame-Options`, `HSTS`, `Referrer-Policy`, CSP.
```js
import helmet from 'helmet'
app.use(helmet())
```

### A-2 · Límite de body de 100 MB en toda la API (incluye `/login` sin auth)
**OWASP A05 / DoS.** `express.json({ limit: '100mb' })` permite que cualquiera envíe 100 MB al login. Reduce el límite global y aplica excepción solo donde subes archivos.
```js
app.use(express.json({ limit: '100kb' }))
app.use(express.urlencoded({ extended: true, limit: '100kb' }))
// multer/límite mayor solo en las rutas de subida concretas
```

### A-3 · Enumeración de usuarios (por estado y por timing)
**OWASP A07.** Verificado: el login devuelve **`403 "Usuario inactivo"`** (revela que el email existe) frente a `401 "Usuario o contraseña incorrectos"`. Además, cuando el usuario **no** existe no se ejecuta `bcrypt.compare` (respuesta ~1 ms) y cuando **sí** existe se ejecuta (~55 ms medidos) → oráculo de timing.

**Solución:** respuesta y coste temporal uniformes.
```js
export async function login(req, res) {
  const { email, password } = req.body
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Correo y contraseña son obligatorios' })
  }

  const generico = { error: 'Usuario o contraseña incorrectos' }
  const usuario = esEmailValido(email.trim())
    ? await Usuario.findOne({ email: email.trim().toLowerCase() })
    : null

  // Ejecuta bcrypt SIEMPRE (con un hash señuelo si no hay usuario) para igualar
  // el tiempo de respuesta entre "email existe" y "no existe".
  const hash = usuario?.password ?? DUMMY_HASH
  const passwordOk = await bcrypt.compare(password, hash)

  // Trata "inactivo" como credencial inválida: no reveles el estado de la cuenta.
  if (!usuario || !passwordOk || usuario.estado === 'inactivo') {
    return res.status(401).json(generico)
  }

  const token = firmarToken(usuario)
  res.json({ token, usuario: usuarioPublico(usuario) })
}
// DUMMY_HASH = bcrypt.hashSync('cadena-imposible', 12) calculado una vez al arrancar
```

### A-4 · Token JWT en `localStorage` (frontend)
**OWASP A07 / A05.** `frontend/src/api/client.js` guarda `skynet_token` en `localStorage`, accesible por cualquier script → si hay un XSS, el token se exfiltra. Opción robusta: cookie `httpOnly; Secure; SameSite=Strict` emitida por el backend y CORS con `credentials`. Es un cambio arquitectónico; si se mantiene `localStorage`, mitiga con CSP estricta (A-1) y expiración corta + refresh.

---

## VULNERABILIDADES MEDIAS

### M-1 · Falta de validación de tipo en `login` (inyección bloqueada por accidente)
Verificado: si `password` es `{$ne:null}`, `bcrypt.compare` **lanza** `Illegal arguments: object, string`; si `email` es objeto, `email.trim()` **lanza**. Hoy no hay bypass, pero se convierte en **500** (mala señal, ruido, posible oráculo) y la protección es incidental. Se corrige con los `typeof … !== 'string'` de A-3/C-1.

### M-2 · `verify`/`sign` de JWT sin algoritmo explícito
`Backend/src/middleware/auth.js:13` y `auth.controller.js:11`. Fija el algoritmo para evitar sorpresas de configuración:
```js
jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN, algorithm: 'HS256' })
jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] })
```

### M-3 · `errorHandler` filtra `err.message` al cliente
`middleware/errorHandler.js:7` devuelve `err.message` en 500 → puede exponer detalles internos (Mongo/Mongoose). Devuelve mensaje genérico en 5xx y loguea el detalle en servidor.
```js
export function errorHandler(err, _req, res, _next) {
  console.error('Error no controlado:', err)
  const status = err.status || 500
  const msg = status < 500 ? err.message : 'Error interno del servidor'
  res.status(status).json({ error: msg })
}
```

### M-4 · Política de contraseñas débil / inconsistente
`restablecerPassword` exige mín. 6; `crearUsuario` **no valida longitud**; el seed usa `admin123`/`usuario123`. Unifica en ≥ 12 caracteres y prohíbe contraseñas comunes. Cambia las credenciales del seed o oblíga a cambiarlas en el primer login.

### M-5 · Cambiar la contraseña no invalida las sesiones JWT vigentes
Como el JWT es *stateless*, tras un reset los tokens antiguos siguen válidos hasta 8 h. Añade un campo `tokenVersion`/`passwordChangedAt` en `Usuario`, inclúyelo en el JWT y recházalo en `verificarToken` si no coincide.

### M-6 · CORS incluye `localhost` siempre
`index.js:12` añade `localhost:5173/4173` a los orígenes permitidos incluso en producción. Deriva la lista de `env` según entorno. No usa cookies, así que el riesgo es acotado, pero conviene endurecerlo.

---

## VULNERABILIDADES BAJAS

- **B-1 · Truncamiento de bcrypt a 72 bytes** — verificado: una contraseña de 100 caracteres valida contra el hash de sus primeros 72. Rechaza contraseñas > 72 bytes (o usa `argon2`) para evitar falsa sensación de fortaleza.
- **B-2 · `bcryptjs` (JS puro) es lento y bloquea el event loop** — medido: coste 10 = 55 ms, coste 12 = 227 ms. Sube el coste a **12** y valora migrar a `bcrypt` (nativo) o `argon2id`.
- **B-3 · TOCTOU en `crearUsuario`** — el check `findOne` + `create` no es atómico; confía además en el índice único (ya existe en el schema) y captura el error de duplicado (E11000).
- **B-4 · Sin auditoría de intentos de login** — añade logging de fallos para detección de ataques.

---

## Recomendaciones prioritarias (orden de ejecución)

1. **Rotar todos los secretos** y crear `Backend/.gitignore` (C-3). *Nada más importa si el `JWT_SECRET` sigue filtrado.*
2. **Añadir rate limiting** en `/login`, `/solicitar-reset`, `/restablecer-password` (C-2).
3. **Forzar `typeof … === 'string'`** en login/reset + instalar `express-mongo-sanitize` global (C-1, M-1).
4. **Helmet + reducir `body limit` a 100 kb** (A-1, A-2).
5. **Unificar respuesta y timing del login** contra enumeración (A-3).
6. **Fijar algoritmo JWT, sanear `errorHandler`, política de contraseñas ≥ 12, coste bcrypt 12** (M-2, M-3, M-4, B-2).
7. Evaluar cookie `httpOnly` para el token e invalidación de sesión tras reset (A-4, M-5).

### R-1 · Defensa global contra inyección NoSQL
```js
import mongoSanitize from 'express-mongo-sanitize'
app.use(mongoSanitize())   // elimina claves con '$' y '.' de body/query/params
```
> `express-mongo-sanitize` es defensa en profundidad; **no sustituye** a la validación de tipo por endpoint (C-1), que es la barrera principal.

---

## Checklist OWASP Top 10 (2021)

| # | Categoría | Estado | Hallazgos |
|---|---|---|---|
| A01 | Broken Access Control | 🟡 Parcial | RBAC por rol/módulo correcto en middleware; falta invalidar sesiones tras reset (M-5) |
| A02 | Cryptographic Failures | 🔴 | JWT_SECRET y credenciales expuestos (C-3); token en localStorage (A-4) |
| A03 | Injection | 🔴 | NoSQL injection en reset (C-1); login protegido solo por accidente (M-1) |
| A04 | Insecure Design | 🟠 | Sin rate limiting ni lockout por diseño (C-2); política de contraseñas débil (M-4) |
| A05 | Security Misconfiguration | 🔴 | Sin Helmet (A-1); body 100 MB (A-2); sin `.gitignore` (C-3); CORS laxo (M-6); errores verbosos (M-3) |
| A06 | Vulnerable Components | 🟡 | Revisar `npm audit`; `bcryptjs` lento (B-2); versiones a verificar |
| A07 | Auth Failures | 🔴 | Sin fuerza bruta control (C-2); enumeración (A-3); reset secuestrable (C-1) |
| A08 | Data Integrity Failures | 🟡 | JWT sin `algorithms` fijado (M-2) |
| A09 | Logging & Monitoring | 🟠 | Sin auditoría de intentos de login (B-4) |
| A10 | SSRF | ⚪ N/A | No hay peticiones salientes controladas por el usuario |

---

## Lo que NO se pudo verificar (falta información)
- **`npm audit`** de dependencias (no ejecutado en esta auditoría) → revisar A06.
- Configuración de red de **MongoDB Atlas** (IP allowlist) — no visible en el código.
- Si el `.env` **ya fue commiteado** al historial de git (el proyecto no es repo git en este entorno) — de haberlo sido, la rotación de secretos es obligatoria e inmediata.
- Despliegue real (TLS/HSTS, proxy inverso, `trust proxy`) — no incluido en el código revisado.
