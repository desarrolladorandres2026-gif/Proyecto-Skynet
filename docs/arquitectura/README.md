# Arquitectura empresarial de Skynet — Plataforma Integral del Terminal

Este directorio documenta la transformación de Skynet, hoy enfocado en la
operación de despachos, en la plataforma integral de gestión interna del
Terminal de Transporte de Neiva. Es un trabajo de **arquitectura y consultoría
funcional**, no de implementación: cada documento es un entregable de
análisis (entidades conceptuales, relaciones, reglas de negocio, impacto),
sin diseño de base de datos ni de API.

## Cómo se organiza este trabajo

Se avanza **área por área**, sin empezar la siguiente hasta cerrar la
anterior. Cada documento de área sigue la misma metodología obligatoria:

1. Auditoría funcional del estado actual
2. Comprensión del negocio
3. Oportunidades de mejora (aplicando las 10 preguntas de reutilización a
   cada entidad candidata)
4. Reorganización propuesta
5. Dominio(s) y módulo(s) propuestos
6. Entidades y relaciones conceptuales
7. Reglas de negocio
8. Automatizaciones y eventos de dominio
9. Indicadores y dashboards
10. Resumen arquitectónico de cierre (impacto, dependencias, reutilización)

## Documentos

| Documento | Estado | Contenido |
|---|---|---|
| [00-diagnostico-arquitectura-actual.md](00-diagnostico-arquitectura-actual.md) | Completo | Arquitectura conceptual de Skynet hoy: fortalezas a preservar, limitaciones frente a la visión a 10-15 años, cimientos transversales a construir |
| [01-talento-humano.md](01-talento-humano.md) | Completo — pendiente de validación | Auditoría funcional del área Administrativa: Talento Humano |

**Próximas áreas** (orden acordado): Activos e inventario → Contratos y
proveedores → PQRS y comunicaciones.

## Principios que gobiernan cada propuesta

Ver el detalle en cada documento, pero todo elemento nuevo debe responder:
compatibilidad con lo existente, no duplicar información, reutilizar
entidades existentes, bajo acoplamiento/alta cohesión, y quedar preparado
para que la plataforma crezca a cientos de módulos sin perder organización.
