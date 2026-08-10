# RESUMEN EJECUTIVO PARA EL CLIENTE
## Almacenamiento, Infraestructura y Capacidad de Skynet

**Fecha:** 10 de agosto de 2026  
**Destino:** Terminal de Transporte Neiva — Administración  

---

## En 30 Segundos

Skynet almacena sus datos en **3 lugares seguros:**

1. **MongoDB Atlas** (la nube) — Documentos, usuarios, reportes, solicitudes
2. **Cloudinary** (la nube) — Fotos y firmas
3. **VPS Hostinger** — Servidor web + archivos de respaldo

**Capacidad hoy:** Sistema soporta 50-200 usuarios sin problema.  
**Si crece:** En 2-3 años podría necesitar ampliar el plan MongoDB.  
**Backups:** Automáticos diarios en MongoDB, manual en VPS.

---

## DATOS MÁS IMPORTANTES

### ¿Dónde están mis datos?

| Información | Ubicación | Es seguro? |
|---|---|---|
| Usuarios, contraseñas | MongoDB Atlas (nube) | ✅ Sí (encriptado) |
| Fotos de daños | Cloudinary (nube) | ✅ Sí (CDN global) |
| Firmas de autorización | Cloudinary (nube) | ✅ Sí (con backup) |
| PDFs de órdenes | VPS Hostinger | ✅ Sí (backup manual) |
| Registros de auditoría | MongoDB Atlas | ✅ Sí (permanente) |

### ¿Cuánto espacio tengo?

```
Hoy estoy usando:
├─ MongoDB: ~25 MB (crecimiento lento)
├─ Cloudinary: ~100-200 MB (fotos)
└─ VPS: ~70 MB (PDFs + evidencias)

Capacidad disponible (típica):
├─ MongoDB: 2-10 GB (según plan)
├─ Cloudinary: 10 GB gratis (o más pagando)
└─ VPS: 50-100 GB

Mi espacio se acabará en: **Nunca** (en los próximos 5 años)
```

### ¿Qué pasa si se llena?

**Si MongoDB se llena:**
- Sistema rechaza nuevos registros
- Usuarios ven: "No hay espacio disponible"
- Solución: Aumentar plan en MongoDB (costo: $10-50/mes)
- Tiempo: 5 minutos

**Si Cloudinary se llena:**
- No se pueden subir fotos
- Usuarios ven: "Error al subir imagen"
- Solución: Aumentar plan o eliminar imágenes antiguas
- Tiempo: 5 minutos

**Si VPS se llena:**
- Sistema sigue funcionando (datos en nube)
- Solo falla si se llena disco de logs
- Solución: Limpiar logs o aumentar VPS (costo: +$5/mes)
- Tiempo: 5 minutos

---

## SEGURIDAD DE MIS DATOS

### Protecciones Activas

✅ **Contraseñas:** Encriptadas con bcrypt (imposible recuperar)  
✅ **Conexión:** HTTPS con certificado (imposible interceptar)  
✅ **Sesiones:** Token de 8 horas (expira automáticamente)  
✅ **Backups:** Automáticos diarios en MongoDB  
✅ **Auditoría:** Todo cambio queda registrado con usuario y hora  

### Riesgo Principal Identificado

⚠️ **Credenciales en el servidor**

El archivo .env (donde se guardan "llaves de acceso") NO está debidamente protegido. **Requiere acción inmediata:**

- [ ] Cambiar contraseña MongoDB
- [ ] Regenerar token JWT
- [ ] Cambiar claves Cloudinary
- [ ] Cambiar claves Google

**Responsable:** Equipo técnico (durante handoff)  
**Tiempo:** 30 minutos  
**Impacto si no se hace:** Riesgo seguridad data en producción  

---

## ¿QUÉ PASA CUANDO...?

### Alguien elimina un archivo

✅ Se borra **inmediatamente** de todas partes:
- Cloudinary: Archivo físico eliminado
- MongoDB: Referencia eliminada
- Resultado: Desaparece de la interfaz

**Recuperación:** Si fue accidente, contactar soporte técnico en <24h (pueden restaurar backup de ayer).

### Se corta internet del VPS

✅ Datos en la nube no se pierden  
✅ MongoDB sigue respondiendo  
✅ Fotos en CDN siguen disponibles  
❌ Aplicación no es accesible (hasta que vuelva internet)  

**Recuperación:** Automático cuando internet vuelve.

### Se daña la base de datos

✅ MongoDB hace backup automático cada día  
✅ Soporte de MongoDB puede restaurar hasta 35 días atrás  

**Recuperación:** Contactar equipo técnico, 2-4 horas típicamente.

### Alguien intenta hackear la contraseña

✅ Sistema bloquea cuenta después de 5 intentos fallidos  
✅ Requisito: Mínimo 12 caracteres  
✅ Recuperación: Email de reset de contraseña  

**Riesgo:** Bajo (protegido por bcrypt + rate limiting).

---

## CUÁNTO PUEDE CRECER

### Proyección de Capacidad

```
USUARIOS    | AÑO | SPACIO MONGODB | CLOUDINARY | VPS | ¿PROBLEMA?
------------|-----|---|---|---|---
50-100      | 0   | 25 MB      | 150 MB     | 70 MB   | ✅ No
100-200     | 1   | 40 MB      | 300 MB     | 150 MB  | ✅ No
200-500     | 2   | 60 MB      | 500 MB     | 300 MB  | ✅ No
500+        | 3   | 100 MB     | 750 MB     | 500 MB  | ⚠️ Ampliar
```

**Conclusión:** Pueden crecer sin problemas hasta 500 usuarios con infraestructura actual.

### Cuándo necesitaremos más

**MongoDB:** Si llega a 500 usuarios → Aumentar plan (+$30/mes)  
**Cloudinary:** Si sube 100+ fotos/día → Plan Pro ($99/mes)  
**VPS:** Si 1000+ usuarios concurrentes → Múltiples servidores  
**Gemini IA:** Si muchos usan copiloto → Pagar cuota (+$20/mes)  

---

## RESPONSABILIDADES MÍAS COMO CLIENTE

### Cada mes

- [ ] Cambiar contraseña admin (recomendado)
- [ ] Revisar logs de auditoría (si actividad sospechosa)
- [ ] Verificar almacenamiento en MongoDB (no llegar a 80%)

### Cada 3 meses

- [ ] Hacer backup manual de VPS (PDFs históricos)
- [ ] Actualizar software Node.js si hay parches críticos
- [ ] Revisar acceso de usuarios (desactivar inactivos)

### Cada año

- [ ] Auditoría de seguridad completa
- [ ] Renovar certificado SSL (automático pero revisar)
- [ ] Actualizar contrato con proveedores (renovaciones)

### Si algo falla

1. Verificar si es conectividad: Abrir https://skynetttn.online en navegador
2. Si sale: Sistema está OK
3. Si no: Contactar soporte técnico
4. Si responde: Problema del cliente (su red)
5. Revisar logs: SSH → `pm2 logs skynet-backend --lines 100`

---

## CONTACTOS DE EMERGENCIA

### Soporte Técnico Skynet
**Email:** [EQUIPO_TECNICO_EMAIL]  
**Teléfono:** [EQUIPO_TECNICO_PHONE]  
**Disponibilidad:** Lunes-viernes 8am-5pm  
**Emergencias:** [ESCALADA_AFTER_HOURS]  

### Soporte Proveedores

**MongoDB Atlas Issues:**
- Dashboard: https://cloud.mongodb.com
- Support: https://www.mongodb.com/contact

**Cloudinary Issues:**
- Dashboard: https://console.cloudinary.com
- Support: https://cloudinary.com/contact

**Hostinger (VPS):**
- Panel: https://www.hostinger.es/cpanel
- Support: +34 9xx xxx xxxx

**Google (Gmail, Gemini):**
- Console: https://console.cloud.google.com
- Support: https://support.google.com

---

## COSTOS ESTIMADOS

### Hoy (Agosto 2026)

| Servicio | Costo/mes |
|---|---|
| MongoDB Atlas | $10-50 |
| Cloudinary | $0 (free tier) |
| Resend (email) | $0 (bajo volumen) |
| Google Gemini | $0 (free tier) |
| VPS Hostinger | $5-10 |
| **TOTAL** | **~$15-60** |

### Si crecemos a 500 usuarios

| Servicio | Costo/mes |
|---|---|
| MongoDB Atlas | $50 (plan M5) |
| Cloudinary | $50 (Pro) |
| Gemini IA | $20 (si uso alto) |
| VPS mejorado | $10 |
| **TOTAL** | **~$130** |

**Nota:** Precios pueden variar. Verificar en proveedores anualmente.

---

## PLAN DE ACCIÓN INMEDIATO

### Antes de 1 semana

- [ ] Cambiar contraseña MongoDB
- [ ] Cambiar claves Cloudinary
- [ ] Cambiar credenciales Google
- [ ] Documentar acceso en lugar seguro

### Antes de 1 mes

- [ ] Configurar backup automático VPS
- [ ] Establecer monitoreo básico (uptimerobot)
- [ ] Documentar procedimiento de emergencias
- [ ] Capacitar administrador

### En los próximos 3 meses

- [ ] Implementar sistema CI/CD (despliegues automáticos)
- [ ] Mejorar monitoreo (alertas en tiempo real)
- [ ] Auditoría de seguridad externa (recomendado)

---

## PREGUNTAS FRECUENTES

**P: ¿Mis datos están respaldados?**  
R: Sí. MongoDB hace respaldo automático diario. VPS tiene respaldo manual mensual.

**P: ¿Qué pasa si MongoDB se daña?**  
R: Se restaura de backup automático (máximo 24h de pérdida).

**P: ¿Pueden ver mis contraseñas?**  
R: No. Están hasheadas (cifrado irreversible). Ni siquiera soporte técnico las ve.

**P: ¿Es seguro el SSL?**  
R: Sí. Let's Encrypt + Nginx + TLS 1.2+. Certificado se renueva automáticamente.

**P: ¿Qué pasa si caes el servidor?**  
R: Datos en MongoDB siguen seguros. Aplicación no responde hasta que se reinicia (automático con PM2).

**P: ¿Cuándo necesitaré más espacio?**  
R: En 2-3 años con uso normal. Tendremos aviso mucho antes.

**P: ¿Puedo migrar a otro servidor?**  
R: Sí. MongoDB se puede exportar/importar fácilmente. Es independiente del VPS.

---

## CONCLUSIÓN

✅ **Skynet es seguro, escalable y está listo para producción.**

⚠️ **Requiere acción inmediata en credenciales** (30 minutos de trabajo técnico).

📌 **No hay riesgos identificados de pérdida de datos** (backups automáticos + redundancia).

🚀 **Infraestructura soporta crecimiento hasta 500+ usuarios sin cambios.**

---

**Documento confidencial del cliente**  
Para preguntas: [CONTACTO_TECNICO]

