# 00 — Diagnóstico de la arquitectura actual de Skynet

## 1. Alcance

Antes de proponer un solo módulo nuevo, el equipo de arquitectura debe
entender qué existe, por qué está diseñado así, y qué de eso es una fortaleza
que hay que preservar y reutilizar deliberadamente frente a qué es una
limitación que va a doler cuando el sistema tenga cientos de módulos en vez
de una decena.

Este diagnóstico es la base de todos los documentos de área que siguen: cada
propuesta futura debe apoyarse en las fortalezas de esta sección y evitar
reproducir las limitaciones.

## 2. Arquitectura conceptual actual

Skynet es hoy un monorepo con dos aplicaciones (React/Vite y
Express/Mongoose sobre MongoDB Atlas) que integra tres subsistemas bajo un
mismo shell de sesión y sidebar:

- **ERP nuevo** (Empresas, Vehículos, Conductores, Plataformas, Rutas,
  Horarios, Despachos, Novedades, Objetos perdidos, Daños): gobernado por
  **RBAC dinámico** (Rol/Permiso en base de datos).
- **Un módulo legado** (Mantenimiento de equipos de TI): gobernado por un
  esquema binario más simple (`Usuario.modulos`), sin migrar todavía al RBAC
  granular.
- **Servicios transversales de plataforma**, incipientes pero presentes:
  identidad/sesión, auditoría, y — recién incorporado — gobierno de
  activación de módulos.

El patrón de construcción para cada dominio del ERP nuevo es consistente:
`repository` (solo acceso a datos) → `service` (reglas de negocio, siempre
recibe al usuario actor para auditar) → `dto` (validación de entrada con
`zod` + forma de salida pública) → `controller` (capa delgada) → `routes`
(quién puede entrar). El frontend espeja esto con un cliente API por dominio,
páginas por módulo, y dos registros centrales: `modulosRegistry.js` (qué
aparece en el sidebar y bajo qué gate) y `App.jsx` (qué rutas existen).

## 3. Fortalezas — preservar y reutilizar

Estas piezas ya están resueltas correctamente y **cualquier área nueva debe
apoyarse en ellas**, no reinventarlas:

- **RBAC dinámico y data-driven.** Roles y permisos viven en MongoDB, se
  administran desde la UI, y un permiso nuevo (`modulo:accion`) se agrega al
  catálogo (`seedData/rbac.data.js`) sin tocar lógica de autorización. Esto
  es exactamente lo que una plataforma de cientos de módulos necesita: la
  autorización no debe crecer en complejidad de código, solo en filas de
  catálogo.
- **Auditoría genérica y desacoplada.** `RegistroAuditoria` no conoce el
  dominio que audita (`modulo`, `entidad`, `entidadId`, `cambios.antes/
  después` son genéricos). Cualquier `service` nuevo llama
  `registrarAuditoria()` sin que el modelo de auditoría necesite cambiar.
  Esto ya es, en la práctica, un servicio transversal bien diseñado.
- **Scoping multi-tenant ya resuelto.** `cargarScopeEmpresa` + `req.scope`
  demuestran que el sistema ya sabe filtrar/forzar datos por una dimensión
  organizacional (hoy "empresa transportadora"). El patrón es reutilizable
  el día que una entidad interna necesite un scoping análogo (p. ej. por
  dependencia), aunque **no debe forzarse donde no aplica** — ver §4.
- **Patrón de capas uniforme.** Que los ~10 dominios del ERP sigan
  exactamente el mismo esqueleto de 5 archivos hace que un desarrollador (o
  un agente) que entienda un módulo entienda todos. Es la base que hace
  viable escalar a cientos de módulos sin que cada uno reinvente su propia
  estructura.
- **Registro único de sidebar y de rutas.** `modulosRegistry.js` ya es un
  punto de extensión central: agregar un módulo es una entrada nueva, no una
  reescritura del layout. Es el precedente correcto para cualquier "registro
  central" que las áreas nuevas necesiten.
- **Gobierno de activación de módulos** (`ModuloSistema`, recién
  incorporado). El Super Administrador puede apagar un módulo completo —
  API y UI — sin tocar código ni RBAC. Es el primer servicio transversal de
  plataforma explícito y sienta el patrón para los siguientes: catálogo en
  `seedData/`, sincronización idempotente al arrancar, y una colección de
  estado separada del catálogo de código.
- **`safeRouter`/`asyncHandler`.** Ningún endpoint nuevo puede "olvidar"
  capturar sus errores async. Con cientos de endpoints futuros, esta
  garantía estructural vale más que cualquier disciplina individual.
- **Seguridad de sesión ya endurecida** (cookie httpOnly, revalidación
  contra BD en cada request, `tokenVersion`, bloqueo por fuerza bruta,
  anti-enumeración, `mongo-sanitize`). No es algo a rediseñar; es una base
  sobre la que las áreas nuevas heredan seguridad gratis con solo pasar por
  `verificarToken`.

## 4. Limitaciones estructurales frente a la visión a 10-15 años

Ninguna de estas es un defecto de lo construido hasta ahora — son huecos
esperables en un sistema que hasta hoy solo necesitaba resolver despachos.
Se listan porque la transformación a plataforma integral **sí** los va a
exponer:

- **`Empresa` está semánticamente comprometido.** Hoy significa
  exclusivamente "empresa transportadora" (tenant externo con vehículos,
  conductores, rutas). La organización interna del Terminal (dependencias,
  áreas, cargos) es un concepto completamente distinto y **no debe
  modelarse reutilizando `Empresa`** solo porque el nombre genérico tienta a
  ello — sería acoplar dos dominios sin relación real y arrastraría el
  scoping multi-tenant a un lugar donde no aplica.
- **`Usuario` mezcla tres responsabilidades.** Credencial de acceso
  (email/password/tokenVersion), perfil de despliegue en UI (nombre), y un
  atributo organizacional sin estructura (`dependencia: String` libre, sin
  validar, no reportable, no jerárquico). No existe hoy ninguna entidad
  "persona/empleado": el sistema tiene cuentas, no expedientes.
- **No hay gestión documental transversal.** La única integración con
  Cloudinary vive cableada dentro de `modules/danos` (multer memoryStorage →
  upload_stream, carpeta fija `skynet/danos`). Cualquier área nueva que
  necesite adjuntos (hoja de vida, contrato, certificado, evidencia
  fotográfica de un activo) enfrentaría la disyuntiva de duplicar ese
  cableado o esperar a que se abstraiga primero.
- **No hay motor de solicitud → aprobación.** Ningún flujo del sistema hoy
  necesita una aprobación humana con estados intermedios (el despacho es una
  máquina de estados operativa, no una aprobación). Vacaciones, permisos,
  solicitudes de equipos, contratos: todos son fundamentalmente "alguien
  pide, alguien con autoridad aprueba o rechaza, queda trazado". Sin un
  servicio genérico para esto, cada módulo nuevo reimplementaría su propia
  variante de la misma máquina de estados.
- **No hay bus/registro de eventos de dominio.** Hoy los módulos se
  comunican por **llamada directa** (p. ej., registrar una salida libera la
  plataforma acoderada, en el mismo `service`). Funciona bien a la escala
  actual porque son pocos módulos con pocas reacciones en cascada. Con
  cientos de módulos, un hecho de negocio (p. ej. "un empleado se
  desvincula") va a necesitar disparar reacciones en módulos que no deberían
  conocerse entre sí (desactivar su `Usuario`, liberar sus activos
  asignados, cerrar sus capacitaciones pendientes). Sin un mecanismo de
  eventos, esas reacciones se implementan como llamadas directas en cadena,
  que es exactamente el acoplamiento que los principios obligatorios del
  proyecto prohíben.
- **`Novedad` es hoy un concepto de flota, no un servicio transversal.**
  Registra incidentes/novedades operativas de vehículos y conductores. Es un
  candidato conceptual interesante a generalizar ("evento operativo con
  gravedad y cierre") pero estructuralmente hoy pertenece a `operacion`, y
  no debe asumirse como reutilizable sin decidirlo explícitamente.

## 5. Conclusión — qué construir antes de escalar

El usuario ya validó el criterio: **cimientos primero**. Priorizados por
impacto en las próximas áreas (Talento Humano es la primera):

| Cimiento | Estado | Prioridad |
|---|---|---|
| RBAC dinámico | Ya existe | — |
| Auditoría genérica | Ya existe | — |
| Gobierno de módulos activables | Ya existe (recién construido) | — |
| Gestión documental transversal | No existe | Alta — Talento Humano la necesita desde el primer expediente |
| Motor de solicitud → aprobación | No existe | Alta — vacaciones/permisos son el primer caso de uso real |
| Bus/registro de eventos de dominio | No existe | Media — se vuelve crítico en cuanto exista una segunda área que reaccione a hechos de la primera |
| Notificaciones como servicio transversal | Parcial (infra existe, acoplada) | Media |
| Catálogo unificado | Disperso, funcional | Baja — no forzar unificación sin un dolor real que la justifique |

**Nota de método:** "cimientos primero" no significa construir los cuatro
servicios transversales de forma especulativa antes de tocar Talento
Humano. Significa que, cuando Talento Humano necesite adjuntar un documento
o gestionar una solicitud de vacaciones, esa necesidad se resuelve
**diseñando el servicio transversal correspondiente**, no una solución
ad-hoc dentro del módulo — evitando así que Contratos, PQRS o el área de
Activos reinventen su propia versión más adelante. El documento de Talento
Humano (`01-talento-humano.md`) ya señala explícitamente dónde aparece esta
necesidad.
