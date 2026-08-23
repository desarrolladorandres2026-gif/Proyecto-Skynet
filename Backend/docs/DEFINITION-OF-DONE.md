# Definition of Done — Proyecto Skynet

Checklist obligatorio para CUALQUIER funcionalidad nueva o cambio a una
existente, antes de considerarla lista para producción. No depende de que
quien programa se acuerde de memoria: `npm run verify` (ver
`scripts/verificar-produccion.js`) automatiza la parte que se puede
automatizar; el resto es una checklist explícita para revisar a mano en
cada PR.

Orden obligatorio (cada paso asume que el anterior ya se resolvió):

```
NUEVA FUNCIONALIDAD
  → AUTH
  → PERMISOS
  → VALIDACIÓN
  → INTEGRIDAD
  → CONCURRENCIA
  → AUDITORÍA
  → SEGURIDAD
  → BACKUP SI APLICA
  → TESTS
  → LINT
  → BUILD
  → VERIFY
  → PRODUCCIÓN
```

---

## 1. AUTH — ¿quién puede ni siquiera llegar aquí?

- [ ] Toda ruta nueva bajo `Backend/src/modules/*/  *.routes.js` pasa por
      `verificarToken` (`Backend/src/middleware/auth.js`), salvo que sea
      **deliberadamente** pública (hoy solo: `POST /auth/login`,
      `POST /auth/solicitar-reset`, `GET /auth/validar-token`,
      `POST /auth/restablecer-password`, `GET /plataforma/estado`,
      `GET /health`). Si agregas una ruta pública nueva, decláralo
      explícitamente en `ROUTERS_PUBLICOS_PERMITIDOS` de
      `scripts/verificar-produccion.js` con un comentario que explique por
      qué — si no, el verify la marcará como sospechosa.
- [ ] Si la acción requiere reautenticación (irreversible: borrado
      definitivo, purga masiva) — reutiliza `utils/reautenticacion.js`
      (`reautenticar(usuarioId, password)`), no inventes un mecanismo nuevo.
- [ ] Si la acción invalida sesiones (cambio de contraseña/rol/estado),
      incrementa `tokenVersion` y limpia `sesionesActivas` — ver el patrón
      en `usuarios.controller.js#actualizarUsuario`.

## 2. PERMISOS — ¿quién, ya autenticado, puede hacer ESTO?

- [ ] ¿La acción es universal para cualquier autenticado (como "reportar un
      daño")? Documéntalo explícitamente en un comentario — la ausencia de
      `requierePermiso`/`soloAdmin` debe ser una decisión visible, no un
      olvido.
- [ ] ¿La acción es administrativa o irreversible? Gátala con
      `requierePermiso('modulo:accion')` (`middleware/permisos.js`) o
      `soloAdmin` (`middleware/auth.js`) según el nivel. `esSuperAdmin` ya
      hace bypass automático de `requierePermiso` — no hace falta
      duplicarlo.
- [ ] Si el permiso es nuevo, agrégalo a `seedData/rbac.data.js` (nunca lo
      asignes a mano en Mongo) — `sincronizarCatalogoSistema()` lo crea al
      arrancar sin pisar asignaciones existentes.
- [ ] **Nunca** dejes que un campo del body determine un nivel de privilegio
      (p. ej. `esSuperAdmin: true`) sin verificar explícitamente que quien
      hace la petición YA tiene ese nivel — ver el patrón en
      `roles.service.js#exigirSuperAdminParaNivelSuperAdmin`.
- [ ] Si el recurso tiene "dueño" (pertenece a un usuario concreto),
      verifica la propiedad en el Service, no confíes en que el frontend no
      mande otro `:id` — ver el patrón `puedeVer()`/`esParticipante()` en
      `ausencias`, `danos`, `mantenimiento/ordenes`.

## 3. VALIDACIÓN — ¿los datos de entrada son lo que dicen ser?

- [ ] Tipos validados antes de tocar Mongo (`typeof x !== 'string'` para
      cualquier campo que se use en una consulta — bloquea inyección de
      operadores `$gt`/`$ne` vía body/query). `express-mongo-sanitize` ya
      corre global como defensa en profundidad, pero no sustituye la
      validación explícita en el controller/DTO.
- [ ] Si el módulo usa `zod` (como `roles.dto.js`), prefiérelo para objetos
      con muchos campos.
- [ ] Archivos subidos: `fileFilter` de multer por `mimetype` (primera
      capa) + `validarContenidoReal(categoriaDe)` de
      `utils/validarContenidoArchivo.js` DESPUÉS de multer, para confirmar
      que el contenido real coincide con lo declarado — ver el patrón en
      `ordenes.routes.js`/`mantenimiento.routes.js`. Nombres de archivo
      siempre generados por el servidor (`Date.now()_...`), nunca el
      nombre que manda el cliente tal cual.

## 4. INTEGRIDAD — ¿este cambio puede dejar datos huérfanos o inconsistentes?

- [ ] Si el modelo nuevo tiene `ref: 'Usuario'`, decide de entrada si es
      **Grupo A** (estado personal/de sesión, sin valor institucional — se
      puede cascade-delete) o **Grupo B** (historial de negocio — debe
      sobrevivir a la eliminación del usuario) y agrégalo a la lista
      correspondiente en
      `Backend/src/modules/usuarios/usuarios.eliminacion.js`
      (`COLECCIONES_GRUPO_A`/`COLECCIONES_GRUPO_B`). Ver
      `docs/ARQUITECTURA-SEGURIDAD-E-INTEGRIDAD.md` §3 para el criterio
      completo. **Este paso es fácil de olvidar — si lo saltas, un usuario
      con historial en el modelo nuevo podría eliminarse físicamente sin
      que el sistema lo detecte.**
- [ ] Si el cambio agrega un DELETE/hard-delete nuevo: ¿qué otras
      colecciones referencian este documento? ¿Deben impedir el borrado, o
      el borrado debe cascadear también hacia ellas? No asumas — revísalo
      explícitamente (ver §5 de la arquitectura).
- [ ] Snapshots: si el documento firma/aprueba algo (nombre, cargo, firma
      de un usuario), congela un snapshot en el momento del hecho — no
      dependas de poder hacer `populate()` para siempre (ver
      `Requerimiento.financiero.nombreAprobador` como ejemplo ya
      establecido).

## 5. CONCURRENCIA — ¿dos peticiones simultáneas pueden romper esto?

- [ ] Patrón "leer → decidir → escribir" sin atomicidad = riesgo de
      duplicado/inconsistencia bajo doble clic o dos pestañas. Prefiere
      `findOneAndUpdate` con el estado esperado EN EL FILTRO (compare-
      and-swap) — ver `plataforma.service.js` como referencia del patrón ya
      usado y probado (`cerrarMantenimiento`, con test de concurrencia real
      vía `Promise.all` en `plataforma.estado.test.js`).
- [ ] Si de verdad hace falta atomicidad entre VARIOS documentos (no un
      solo `findOneAndUpdate`), usa una transacción de Mongoose
      (`mongoose.startSession()` + `session.withTransaction()` — ver
      `usuarios.eliminacion.js#eliminarUsuarioDefinitivamente`). No agregues
      transacciones por defecto — la mayoría de las operaciones de este
      proyecto son de un solo documento o deliberadamente best-effort (ver
      §6 de la arquitectura para la clasificación completa).

## 6. AUDITORÍA — ¿queda rastro de quién hizo qué?

- [ ] Toda acción de creación/edición/eliminación con impacto de negocio
      llama a `registrarAuditoria()` (`utils/auditoria.js`) — mismo patrón
      que ya usan `usuarios`, `roles`, `auditoria`, `backup`.
- [ ] Si el cambio toca datos que la auditoría ya rastrea (Usuario, Rol,
      Permiso), no rompas el snapshot desnormalizado
      (`RegistroAuditoria.usuarioNombre`) que le permite sobrevivir a un
      borrado posterior.

## 7. SEGURIDAD — repaso final antes de tests

- [ ] Sin secretos/credenciales hardcodeadas (el verify lo chequea, pero
      revisa a mano igual).
- [ ] Sin `console.log`/`console.error` de contraseñas, tokens, o
      cabeceras `Authorization`.
- [ ] CORS/cookies sin tocar (`httpOnly`, `secure` en producción,
      `sameSite:'strict'`) salvo que el cambio sea justo sobre eso.
- [ ] Si agregas una dependencia nueva: `npm audit` antes y después,
      confirma que no introduce vulnerabilidades críticas/altas.

## 8. BACKUP SI APLICA

- [ ] ¿El cambio es una migración de datos o toca un script destructivo?
      Debe usar `guardaProduccion()` (`scripts/lib/guardaProduccion.js`) —
      el verify lo detecta si falta.
- [ ] ¿El cambio agrega una colección con datos de negocio nuevos e
      importantes? Confirma si debería incluirse en
      `scripts/backup/respaldar.js` (hoy hace `mongodump` completo, así que
      cualquier colección nueva YA queda cubierta automáticamente — no
      hace falta tocar el script salvo que quieras excluir algo).

## 9. TESTS

- [ ] Al menos un test que confirme el camino feliz.
- [ ] Al menos un test NEGATIVO por cada barrera nueva (auth, permiso,
      IDOR, validación) — "usuario sin el permiso recibe 403", "usuario A
      no puede tocar el recurso de B", "input malformado da 400 no 500".
- [ ] Si agregaste una operación destructiva nueva: test de que NO se
      ejecuta si falla un paso previo (ver el patrón en
      `auditoria.purga.archivado.test.js`: si el archivado falla, no
      purga).
- [ ] `npm test` completo en verde (no solo el archivo nuevo — puede haber
      roto algo en otro módulo).

## 10. LINT

- [ ] Backend: no hay lint configurado hoy (ver Pendiente en la
      arquitectura) — revisar a mano estilo/consistencia.
- [ ] Frontend: `npm run lint` (oxlint) sin errores nuevos (los warnings
      pre-existentes no bloquean, pero no agregues más).

## 11. BUILD

- [ ] Frontend: `npm run build` (vite) sin errores.
- [ ] Backend: no tiene paso de build (Node ejecuta el código fuente
      directo) — confirma que arranca (`npm start`) sin errores de import.

## 12. VERIFY

- [ ] `npm run verify` (`scripts/verificar-produccion.js`) en verde — o,
      si hay una advertencia 🟡 nueva y aceptada conscientemente, que quede
      documentada en el PR por qué se acepta.

## 13. PRODUCCIÓN

- [ ] Si el cambio requiere una variable de entorno nueva: agregada a
      `Backend/.env.example`, `.env.development.example` y
      `.env.production.example`, con comentario explicando si es opcional
      y qué pasa si falta.
- [ ] Si el cambio es una migración de esquema: ¿es compatible con
      documentos ya existentes sin migrar (patrón expand-contract, como
      `Mantenimiento.estado` con `ESTADOS_LEGADO`+`ESTADOS_OT` conviviendo)?
      Un deploy no debe requerir downtime para migrar datos salvo que sea
      estrictamente inevitable.
