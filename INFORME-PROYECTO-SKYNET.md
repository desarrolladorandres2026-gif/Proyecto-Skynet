# INFORME DEL PROYECTO SKYNET
## ERP del Terminal de Transporte de Neiva

**Fecha:** 27 de julio de 2026
**Estado:** Fases 0–3 del roadmap implementadas y probadas

---

## 1. Resumen ejecutivo

Skynet es un sistema unificado que integra una aplicación legada
(mantenimiento de equipos de TI) con un ERP nuevo
para la operación del Terminal de Transporte de Neiva. Está construido como
monorepo con dos aplicaciones:

| Componente | Tecnología | Puerto |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind (PWA instalable) | 5175 |
| Backend | Node.js + Express 4 + Mongoose 8 | 3001 |
| Base de datos | MongoDB Atlas (base `Skynet`, cluster `ttn`) | nube |
| Imágenes | Cloudinary (fotos de reportes de daños) | nube |
| Correo | Gmail SMTP (recuperación de contraseña) | nube |
| Notificaciones | Web Push con claves VAPID | nube |

El control de acceso es un **RBAC dinámico**: los roles y permisos viven en
la base de datos y se administran desde la interfaz, sin tocar código.

---

## 2. Arquitectura general

```
┌─────────────────┐   fetch /api/*    ┌──────────────────┐   mongoose   ┌───────────────┐
│  React SPA/PWA  │ ────────────────► │   Express API    │ ───────────► │ MongoDB Atlas │
│  (puerto 5175)  │  cookie httpOnly  │  (puerto 3001)   │              │  base Skynet  │
└─────────────────┘       JWT         │                  │──► Cloudinary (fotos daños)
                                      │  helmet · cors   │──► Gmail SMTP (reset clave)
                                      │  rate-limit      │──► Web Push (notificaciones)
                                      │  mongo-sanitize  │──► /storage (PDFs legados)
                                      └──────────────────┘
```

**Decisiones clave:**

- La sesión viaja en una **cookie httpOnly** con un JWT firmado HS256: el
  JavaScript del navegador nunca puede leer el token (inmune a robo por XSS).
- **Cada petición se revalida contra la base de datos** — no se confía en el
  contenido del JWT. Desactivar un usuario o cambiarle el rol aplica al
  instante, sin esperar a que expire el token (8 horas).
- El módulo legado (mantenimiento TI) conserva su esquema de
  acceso binario (`Usuario.modulos`); el ERP nuevo usa el RBAC granular.
  Conviven sin interferirse.

---

## 3. Estructura de carpetas

### Backend (`backend/`)

```
backend/
├─ scripts/                  seed.js · seed-operacion.js · migraciones MySQL/PG
└─ src/
   ├─ index.js               bootstrap de Express y middlewares globales
   ├─ config/                env.js · db.js (fallback DNS) · cloudinary.js
   ├─ middleware/
   │  ├─ auth.js             verificarToken (revalida BD en cada petición)
   │  ├─ permisos.js         requierePermiso() · cargarScopeEmpresa()
   │  └─ safeRouter.js       captura errores async de todo handler
   ├─ models/                13 esquemas Mongoose (ver sección 5)
   ├─ modules/               un dominio = una carpeta
   │  ├─ auth/               login · logout · me · reset de contraseña
   │  ├─ usuarios/           CRUD de usuarios (solo super admin)
   │  ├─ roles/              RBAC dinámico (repository/service/dto/zod)
   │  ├─ permisos/           catálogo de permisos
   │  ├─ auditoria/          consulta del registro de auditoría
   │  ├─ danos/              reportes de daños + subida a Cloudinary
   │  ├─ flota/              empresas · vehículos · conductores · plataformas
   │  ├─ operacion/          rutas · horarios · despachos · novedades ·
   │  │                      objetos perdidos · dashboard
   │  └─ mantenimiento/      LEGADO: equipos de TI y sus mantenimientos
   ├─ routes/index.js        monta todos los módulos bajo /api
   ├─ seedData/rbac.data.js  FUENTE ÚNICA del catálogo de roles y permisos
   └─ utils/                 scope · auditoria · password · cookies · email
```

### Frontend (`frontend/src/`)

```
frontend/src/
├─ App.jsx                   definición de rutas + gates de permiso
├─ api/                      un client fetch por dominio (auth, flota, operacion…)
├─ auth/
│  ├─ AuthContext.jsx        usuario en sesión · tienePermiso() · tieneModulo()
│  └─ ProtectedRoute.jsx     PermissionRoute (RBAC) · ModuleRoute (legado)
├─ layout/
│  ├─ AppLayout.jsx          sidebar que se arma solo con lo permitido al rol
│  └─ HomeRedirect.jsx       la home de todos es /dashboard
├─ config/modulosRegistry.js registro único del menú (módulos e items con permiso)
├─ components/ui.jsx         primitivas del tema HUD (Card, Modal, Badge, tabla…)
├─ modules/
│  ├─ operacion/             Dashboard · Despachos · Novedades · Rutas/Horarios ·
│  │                         Objetos perdidos
│  ├─ flota/                 Empresas · Vehículos · Conductores · Plataformas
│  ├─ danos/                 Reportar daño · Tareas pendientes
│  ├─ usuarios/ roles/ auditoria/
│  ├─ induccion/             curso institucional (visible para todos)
│  └─ mantenimiento/         LEGADO
└─ pwa/                      banner de instalación · service worker
```

---

## 4. Flujo de una petición protegida

```
Navegador ── GET /api/despachos (cookie JWT) ──►
  1. verificarToken      verifica firma HS256; consulta Usuario+Rol+Permisos
                         en BD → 401 si está inactivo, eliminado o su
                         tokenVersion cambió (cierre de sesión remoto)
  2. cargarScopeEmpresa  si el rol tiene ámbito "empresa", fija req.scope
                         con SU empresa (el cliente no puede elegir otra)
  3. requierePermiso     compara contra los permisos del rol → 403 si falta
                         (el super admin hace bypass total)
  4. Controller          consulta/mutación, filtrada por req.scope
  5. registrarAuditoria  toda mutación queda con quién/qué/cuándo/antes-después
◄── JSON
```

---

## 5. Modelo de datos (13 colecciones)

### Grupo RBAC / seguridad
| Colección | Propósito |
|---|---|
| `Usuario` | credenciales, rol (ref), empresa opcional, tokenVersion, bloqueo por fuerza bruta |
| `Rol` | esSuperAdmin (bypass), ámbito global/empresa, lista de permisos (ref) |
| `Permiso` | código `modulo:accion` (p. ej. `despachos:registrar_salida`) — 31 en catálogo |
| `RegistroAuditoria` | traza de toda mutación relevante |
| `PasswordResetToken` | tokens de un solo uso para recuperar contraseña |
| `PushSubscription` | suscripciones Web Push |

### Grupo ERP (operación del terminal)
| Colección | Propósito | Relaciones |
|---|---|---|
| `Empresa` | empresas transportadoras | — |
| `Vehiculo` | placa única, SOAT y tecnomecánica con vencimiento | → Empresa |
| `Conductor` | cédula única, licencia con vencimiento | → Empresa |
| `Plataforma` | estado libre/ocupada/mantenimiento, vehículo acoderado | → Vehiculo |
| `Ruta` | origen/destino/paradas | — |
| `Horario` | hora de salida recurrente + días | → Empresa, Ruta |
| `Despacho` | consecutivo diario `D-AAAAMMDD-###`, salida/retraso/llegada | → Empresa, Vehiculo, Conductor, Ruta, Plataforma |
| `Novedad` | operativa o incidente de seguridad, gravedad, cierre | → Vehiculo/Conductor opcional |
| `ObjetoPerdido` | custodia → entrega con cédula del reclamante | — |
| `ReporteDano` | fecha/hora + descripción + foto en Cloudinary, flujo pendiente→en_proceso→resuelto | → Usuario |

### Grupo legado
`Equipo`, `Mantenimiento`, `Marca`, `TipoEquipo` (TI).

---

## 6. Roles y sus funciones

**Leyenda:** ✔ gestiona · ○ consulta/acción limitada · Ⓢ gestiona solo su empresa · — sin acceso

| Función | Super Admin | Admin | Empresa | Despachador | Seguridad | Operador | Mantenim. | Usr. Común |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Dashboard | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Reportar daño | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Tareas de daños | ✔ | ✔ | — | — | — | — | ✔ | — |
| Empresas | ✔ | ✔ | Ⓢ | — | — | — | — | — |
| Vehículos | ✔ | ✔ | Ⓢ | ○ | ○ | — | — | — |
| Conductores | ✔ | ✔ | Ⓢ | — | ○ | — | — | — |
| Plataformas | ✔ | ✔ | — | ✔ | — | — | — | — |
| Rutas y horarios | ✔ | ✔ | Ⓢ | ○ | — | — | — | — |
| Despachos | ✔ | ○ | Ⓢ | ✔ | — | — | — | — |
| Novedades e incidentes | ✔ | — | ○ | ○ | ✔ | — | — | — |
| Objetos perdidos | ✔ | — | — | — | ○ | ✔ | — | — |
| Usuarios / Roles / Auditoría | ✔ | — | — | — | — | — | — | — |

Notas:
- **Reportar daño es universal por diseño**: no es un permiso RBAC, basta
  estar autenticado. La gestión de esas tareas sí es permiso (`danos:gestionar`).
- El **Administrador no ve Novedades** porque la especificación original no
  le asignó ese permiso; puede agregárselo el Super Admin desde la página
  «Roles y permisos» sin tocar código.
- El módulo legado (Mantenimiento TI) se asigna aparte, por
  usuario, con el campo `modulos`.
- Matriz **verificada en vivo**: 11 endpoints × 7 roles; cada 200/403
  coincidió con lo esperado.

---

## 7. Flujos de negocio clave

### 7.1 Despacho de un vehículo (rol Despachador)
1. Registrar salida ejecuta un **checklist automático en el servidor**:
   vehículo activo y sin viaje en curso, SOAT y tecnomecánica vigentes,
   conductor activo con licencia vigente, vehículo y conductor de la misma
   empresa, pasajeros ≤ capacidad. Cualquier falla responde 409 con el motivo.
2. Se genera consecutivo diario (`D-20260727-001`) y, si el vehículo estaba
   acoderado, su plataforma se libera automáticamente.
3. Estados: `despachado` → (`retrasado` con minutos y motivo) → `finalizado`
   al registrar la llegada.

### 7.2 Reporte de daño (todos los usuarios)
1. Cualquier usuario reporta con fecha/hora, descripción y foto (la foto se
   sube a Cloudinary, carpeta `skynet/danos`; nada queda en disco local).
2. El reporte nace `pendiente` y aparece como **tarea** para los roles
   Mantenimiento, Administrador y Super Admin (contadores en su dashboard).
3. Mantenimiento lo toma (`en_proceso`) y lo cierra (`resuelto`); el
   reportante sigue el estado en «Mis reportes».

### 7.3 Objeto perdido (Seguridad → Operador)
1. Seguridad registra el hallazgo (descripción, lugar, fecha) → `custodia`.
2. Solo el Operador (o superior) registra la **entrega**, exigiendo nombre y
   cédula de quien recibe → `entregado`, con trazabilidad completa.

### 7.4 Scoping multi-tenant (Empresa Transportadora)
El rol tiene ámbito `empresa`: toda lectura se filtra y toda escritura se
fuerza a SU empresa en el servidor. Probado: al pedir estadísticas con un ID
de empresa ajeno en la URL, el servidor devuelve las de la empresa propia.

---

## 8. Seguridad implementada

| Defensa | Detalle |
|---|---|
| Sesión | JWT HS256 en cookie httpOnly · expira 8 h · `tokenVersion` invalida sesiones remotas al instante |
| Fuerza bruta | 5 intentos fallidos → bloqueo 15 min por cuenta + rate-limit por IP |
| Anti-enumeración | hash señuelo (bcrypt siempre se ejecuta) + respuesta 401 unificada |
| Inyección NoSQL | `express-mongo-sanitize` global + validación de tipos por endpoint |
| Contraseñas | bcrypt 12 rounds · mínimo 12 caracteres · máximo 72 bytes |
| Cabeceras | helmet (HSTS, X-Frame-Options, nosniff…) · CORS con origen explícito y credenciales |
| Payloads | body limitado a 1 MB · subidas con multer limitadas (imágenes 10 MB, PDFs 20 MB) |
| Errores | `safeRouter` envuelve todo handler async · los 5xx no exponen detalles internos |
| Trazabilidad | `RegistroAuditoria` con usuario, acción, entidad y antes/después |

---

## 9. Cuentas de prueba

| Rol | Email | Contraseña |
|---|---|---|
| Super Administrador | prueba.superadmin@skynet.local | Prueba.SuperAdmin.2026 |
| Administrador | administrador@skynet.local | Administrador.Skynet.2026 |
| Empresa Transportadora | empresa@skynet.local | Empresa.Skynet.2026 |
| Despachador | despachador@skynet.local | Despachador.Skynet.2026 |
| Seguridad | seguridad@skynet.local | Seguridad.Skynet.2026 |
| Operador | prueba.operador@skynet.local | Prueba.Operador.2026 |
| Mantenimiento | mantenimiento@skynet.local | Mantenimiento.Skynet.2026 |
| Usuario Común | usuario.comun@skynet.local | UsuarioComun.Skynet.2026 |

Datos demo disponibles (`npm run seed:operacion` en `backend/`): 6 plataformas,
4 rutas (Bogotá, Pitalito, Florencia, La Plata), 3 vehículos (SKY101/202/303),
2 conductores y 4 horarios, todos de «Transportes Demo S.A.S.».

---

## 10. Pendientes y próximos pasos

| Prioridad | Ítem |
|---|---|
| **Inmediato** | Poner credenciales de Cloudinary en `backend/.env` (`CLOUDINARY_CLOUD_NAME`, `API_KEY`, `API_SECRET`) — sin ellas, reportar un daño responde 503 |
| Fase 4 | PQRS · Noticias · Eventos (atención al ciudadano) |
| Fase 5 | Reportes avanzados · Configuración general |
| Mejora | Notificación push al rol Mantenimiento cuando llega un reporte de daño (la infraestructura VAPID ya existe) |
| Mejora | Migrar el módulo legado al RBAC granular |

**Nota de red:** el DNS local falla resolviendo los registros SRV de Atlas
(`querySrv ECONNREFUSED`); `config/db.js` reintenta automáticamente con DNS
público (8.8.8.8 / 1.1.1.1). El warning al arrancar el backend es normal y la
conexión termina estableciéndose.

---

*Informe generado el 27 de julio de 2026.*
