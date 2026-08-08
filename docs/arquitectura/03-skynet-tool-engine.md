# Skynet — motor de herramientas y acciones

Fecha: 2026-08-08. Estado: implementado y verificado (211 pruebas del backend
en verde, frontend compila y pasa las suyas).

Continúa `02-copiloto-voz.md`, que cubre voz, atajos sin LLM y memoria. Este
documento es sobre lo que Skynet puede **hacer**: qué herramientas tiene, cómo
se decide si puede usarlas, y qué impide que haga algo que no debía.

---

## 1. Las cinco capas, y qué garantiza cada una

```
                      ┌──────────────────────┐
   mensaje / voz  ──► │  ROUTER DE INTENCIÓN │  ¿esto necesita al modelo?
                      │  copiloto.intencion  │
                      └──────────┬───────────┘
                        no │            │ sí
                           ▼            ▼
                    ┌───────────┐  ┌──────────────────┐
                    │  ATAJOS   │  │  GEMINI          │  razonador
                    │ plantilla │  │  copiloto.service│
                    └─────┬─────┘  └────────┬─────────┘
                          │                 │ function calling
                          │                 ▼
                          │       ┌─────────────────────┐
                          └──────►│  TOOL REGISTRY      │  ← MISMO Map
                                  │ copiloto.herramientas│
                                  └──────────┬──────────┘
                                             │
                          ┌──────────────────┼──────────────────┐
                          ▼                  ▼                  ▼
                    ┌──────────┐      ┌────────────┐     ┌────────────┐
                    │ INTERNET │      │  SISTEMA   │     │  TERMINAL  │
                    │ búsqueda │      │ hora/fecha │     │ requerim.  │
                    │ wikipedia│      │ calculadora│     │ ausencias  │
                    │ clima    │      │ divisas    │     │ daños      │
                    └──────────┘      └────────────┘     │ dashboard  │
                                                          └────────────┘
                                             │
                                  ┌──────────▼──────────┐
                                  │ FILTRO DE PERMISOS  │  construirHerramientas
                                  │ rol · permiso · mód.│
                                  └──────────┬──────────┘
                                             │
                              ┌──────────────┴──────────────┐
                              ▼                             ▼
                    ┌──────────────────┐          ┌──────────────────┐
                    │ EJECUCIÓN DIRECTA│          │  CONFIRMACIÓN    │
                    │  (solo lectura)  │          │  token + botón   │
                    └──────────────────┘          └──────────────────┘
```

**El punto que sostiene todo lo demás:** el atajo y el modelo comparten el
**mismo** `Map` de herramientas ya filtrado. No hay dos rutas hacia los mismos
datos que puedan desincronizarse.

---

## 2. Herramientas registradas

| Herramienta | Alcance | Módulo | Escribe | Confirma |
|---|---|---|---|---|
| `resumen_dashboard` | propio | — | no | no |
| `mis_requerimientos` | propio | requerimientos | no | no |
| `preparar_requerimiento_compra` | propio | requerimientos | **borrador** | botón propio |
| `mis_reportes_dano` | propio | danos | no | no |
| `mis_ausencias` | propio | ausencias | no | no |
| `cancelar_mi_ausencia` | propio | ausencias | **sí** | **sí** |
| `buscar_wikipedia` | público | — | no | no |
| `consultar_clima` | público | — | no | no |
| `buscar_en_internet` | público | — | no | no |
| `hora_actual` | público | — | no | no |
| `fecha_actual` | público | — | no | no |
| `calcular` | puro | — | no | no |
| `convertir_moneda` | público | — | no | no |
| `abrir_seccion` | propio | — | UI | no |
| `recordar` / `olvidar` / `que_recuerdas` | propio | — | memoria | no |

Todo lo que dice "propio" está acotado al usuario que pregunta **por clausura**:
el `id_usuario` se cierra dentro de `ejecutar` y nunca es un argumento que el
modelo pueda pasar. Alucinar el id de otra persona no sirve de nada porque el
filtro de propiedad no sale del backend.

---

## 3. Cómo se decide si el usuario puede usar una herramienta

`construirHerramientas(usuario, contexto)` aplica cuatro filtros **antes** de
declararle nada al modelo:

```js
{
  modulo: 'ausencias',              // apagado en /sistema/modulos → no existe
  permiso: 'usuarios:gestionar',    // RBAC; array = "cualquiera de estos"
  disponible: (u) => !esBodega(u),  // reglas que no son un permiso
  requiereConfirmacion: true,       // no se ejecuta al pedirla
}
```

**Un modelo no puede invocar lo que nunca vio declarado.** Esa es la
restricción real; el prompt no impone alcance, solo tono y honestidad. Y el
permiso se vuelve a verificar **al ejecutar** (`porNombre.get(nombre)`), porque
declarar y ejecutar son dos momentos distintos.

### Por qué `permiso` y `disponible` conviven

`permiso` es declarativo y es lo que hay que usar. `disponible` existe para las
reglas que **no se pueden escribir como un código RBAC porque son la ausencia
de uno**: "un técnico puro no reporta daños" es
`tiene mantenimiento:ejecutar Y NO tiene danos:gestionar`. No hay permiso que
represente eso.

---

## 4. Acciones sobre la interfaz

`abrir_seccion` no navega: **devuelve una ruta que el frontend ejecuta.**

```
modelo pide  →  resolverDestino(clave, usuario)  →  {navegacion:true, ruta}
                          │
                          └─ filtra contra destinosDisponibles(usuario)
                                        │
             evento SSE {tipo:'navegacion', ruta}
                                        │
             CopilotoWidget → navigate(ruta)
                                        │
             App.jsx → PermissionRoute decide si se pinta
```

Tres capas independientes. Si el catálogo de `copiloto.navegacion.js` se
desactualiza respecto de `App.jsx`, el peor caso es que Skynet **ofrezca** una
página que el guarda después bloquea — nunca que alguien entre donde no debe.

**El catálogo de destinos se inyecta en la descripción de la herramienta**, ya
filtrado por usuario. Por eso Skynet no le ofrece "Roles y permisos" a alguien
de Bodega: no lo ve declarado en ningún momento.

### Al agregar una ruta a `App.jsx`

Agrégala también a `DESTINOS` en `copiloto.navegacion.js` con su mismo permiso
y módulo. Si se olvida, la ruta simplemente no es navegable por voz: se
degrada, no se rompe.

---

## 5. Acciones destructivas: la confirmación es mecánica

La solución ingenua es instruir al modelo: *"antes de borrar algo, pregunta"*.
Eso no es una salvaguarda, es una sugerencia — el modelo puede convencerse de
que ya preguntó, y un texto diseñado para ello puede llevarlo ahí a propósito.

```
1. modelo pide cancelar_mi_ausencia
2. servidor NO ejecuta. Guarda la acción y emite un token de 256 bits
3. usuario pulsa un botón real (tarjeta ámbar, distinta del cian del chat)
4. POST /copiloto/confirmar  ←── ESTE CAMINO NO PASA POR GEMINI
```

El modelo nunca ve el token. **No hay nada que se pueda escribir en el chat que
salte el paso 3** — está verificado en
`tests/copiloto.flujo.confirmacion.test.js`, donde insistir tres veces con
"sí, ya confirmé, cancélala de una vez" no ejecuta nada.

Además:
- Un token vale **una sola vez** (doble clic, reintento del navegador).
- Solo lo canjea **su dueño**; un intento ajeno fallido no lo invalida.
- Caduca a los 5 minutos y vive en memoria: si el servidor se reinicia, lo
  correcto es que caduque, no que se ejecute algo pedido antes de la caída.
- `ejecutarConfirmada` **reconstruye el catálogo de permisos**: manda el
  permiso de ahora, no el de hace cinco minutos.

### Por qué `cancelar_mi_ausencia` y no `eliminar_usuario`

Un mecanismo de confirmación que ninguna herramienta usa es un mecanismo que
nadie sabe si funciona. Se eligió esta por **dónde queda el daño si algo sale
mal**: `cancelarAusencia` rechaza en el propio servicio cualquier ausencia que
no sea del solicitante y cualquiera que no esté pendiente, así que el peor caso
es cancelar una solicitud propia que nadie había respondido.

Una herramienta de borrado administrativo usaría exactamente el mismo mecanismo
y tendría un peor caso incomparable. Se puede agregar igual que esta, pero es
una decisión de producto aparte, no un detalle de implementación.

---

## 6. Búsqueda web: tres proveedores escalonados

| Orden | Proveedor | Key | Gratis | Qué devuelve |
|---|---|---|---|---|
| 1 | Tavily | `TAVILY_API_KEY` | 1.000/mes | **contenido** de cada página |
| 2 | Brave | `BRAVE_SEARCH_API_KEY` | 2.000/mes | título + fragmento + URL |
| 3 | DuckDuckGo IA | — | ilimitado | solo respuestas instantáneas |

**Sin ninguna key el sistema funciona, pero peor.** DuckDuckGo Instant Answer
no es un buscador web: resuelve definiciones y fichas de entidad, y falla en la
mayoría de preguntas de actualidad. Cuando está en ese modo, la herramienta le
manda al modelo una nota explícita de limitación — sin ella, ante cero
resultados el modelo tiende a rellenar de memoria y presentarlo como si lo
hubiera buscado.

Si el proveedor configurado **falla**, no se cae en silencio al modo degradado:
se reporta el error. Degradar en silencio convierte un problema de
configuración en respuestas peores durante semanas sin que nadie se entere.

Descartados: scraping de HTML (nos bloqueó, va contra los términos, se rompe
sin avisar) y el `googleSearch` nativo de Gemini (dejó de ser gratuito para el
modelo que usamos).

---

## 7. La calculadora no usa `eval`

La expresión la escribe un **modelo** a partir de texto de un usuario, así que
hay que asumir que puede llegar cualquier cosa. `eval("process.exit()")` mata
el servidor; `eval("while(1){}")` lo cuelga. Sanear con una regex y después
evaluar tampoco: cada lista negra es una apuesta a haber pensado en todo.

Un parser de descenso recursivo no tiene ese problema **por construcción**:
solo sabe leer números y cinco operadores. No existe la sintaxis con la que
pedirle otra cosa. `tests/copiloto.calculadora.test.js` fija nueve intentos de
inyección conocidos.

Soporta además lo que la gente dice de verdad: `19% de 2 millones`,
`700 mil`, `250 por 38`, `$1.500 + $200`. Y **`billón` es 10¹²** (escala larga
española), no 10⁹ — confundirlo son tres órdenes de magnitud en una cifra de
dinero.

---

## 8. Eventos del stream (respuestas estructuradas)

El frontend **nunca interpreta la prosa del modelo** para decidir qué hacer.

| Evento | Cuándo | Qué hace el frontend |
|---|---|---|
| `inicio` | al abrir el hilo | guarda `conversacionId` |
| `delta` | cada trozo | pinta y encola en TTS |
| `accion` | borrador de requerimiento | dibuja tarjeta cian |
| `navegacion` | `abrir_seccion` con permiso | `navigate(ruta)` |
| `confirmacion` | herramienta destructiva | tarjeta ámbar + abre el chat |
| `fin` | terminó | `via: 'atajo' \| 'modelo'` |
| `error` | falló | banner |

Si la navegación dependiera de detectar *"voy a abrir los reportes"* en el
texto, bastaría con que el modelo redactara distinto —o con que alguien le
pidiera que lo escribiera— para disparar una acción no pretendida.

`confirmacion` es el **único** caso en que el chat se abre solo por voz: una
confirmación exige ver qué se va a hacer, y oír "¿quieres continuar?" sin tener
dónde pulsar no sirve de nada.

---

## 9. Auditoría: qué se registra y qué no

Solo las herramientas marcadas con `auditar: true` dejan fila en
`RegistroAuditoria` (`accion: 'copiloto_herramienta'`). Hoy: `abrir_seccion` y
`cancelar_mi_ausencia`.

**Las consultas de solo lectura no se auditan a propósito.** Una fila por cada
"¿qué tengo pendiente?" ahogaría el registro que se usa para cumplimiento real.
Se guardan los **argumentos** (recortados a 1 KB), nunca el resultado: el
resultado son datos de negocio que ya viven en su propia colección, y copiarlos
duplicaría información sensible en un registro que se consulta con otro
permiso.

La escritura es *fire-and-forget*: si Mongo falla se pierde la fila, no la
respuesta al usuario.

---

## 10. Cómo agregar una herramienta nueva

Un único punto de cambio: el array de `catalogoHerramientas()` en
`copiloto.herramientas.js`.

```js
{
  modulo: 'requerimientos',              // opcional: gate de /sistema/modulos
  permiso: 'requerimientos:ver_todos',   // opcional: RBAC (array = "alguno")
  disponible: (u) => !esBodega(u),       // opcional: reglas que no son permiso
  requiereConfirmacion: false,           // true → no se ejecuta, pide botón
  auditar: false,                        // true → deja rastro
  descripcionConfirmacion: async (args) => '…qué va a pasar…',
  declaracion: {
    name: 'generar_pdf_requerimiento',
    description: 'Cuándo usarla y cuándo NO. El modelo elige por este texto.',
    parameters: {
      type: Type.OBJECT,
      properties: { id: { type: Type.STRING, description: '…' } },
      required: ['id'],
    },
  },
  ejecutar: async ({ id }) => servicioExistente.hacerAlgo(id, usuario),
}
```

Después:

1. **¿Es cacheable?** Añádela a `CACHEABLES` solo si es de solo lectura y su
   resultado vale 20 s. Olvidarla solo la deja lenta; cachear una que escribe
   haría que la segunda llamada no se ejecutara nunca. El error barato es el
   correcto por defecto.
2. **¿Produce algo visual?** Devuelve una marca (`navegacion: true`) y añade el
   `yield` correspondiente en `responderStream`. No uses el nombre de la
   función para decidirlo: la marca sobrevive a un renombre.
3. **¿Es de altísima frecuencia?** Considera un atajo sin LLM en
   `copiloto.intencion.js` + `copiloto.respuestas.js`. Exige señal positiva
   explícita: un falso negativo cuesta 800 ms, un falso positivo responde mal
   con seguridad absoluta.
4. **Prueba el filtro de permisos**, no solo el camino feliz. Lo que importa es
   qué NO aparece para quién.

### Errores: devolver, no lanzar

Quien llama a `ejecutar` es el modelo. Un `{ error: 'texto claro' }` le permite
explicárselo al usuario; una excepción se convierte en un fallo genérico. La
excepción a la excepción: si el resultado se cachea, hay que **lanzar** para
que `CacheLRU.through` no guarde el error durante todo el TTL (ver
`copiloto.divisas.js`).

---

## 11. Variables de entorno

| Variable | Obligatoria | Sin ella |
|---|---|---|
| `GEMINI_API_KEY` | no | el chat responde 409 con mensaje claro |
| `TAVILY_API_KEY` | no | búsqueda web cae al siguiente proveedor |
| `BRAVE_SEARCH_API_KEY` | no | búsqueda web cae a DuckDuckGo (degradado) |

Ninguna key vive en el frontend. Clima (Open-Meteo), Wikipedia y tasas de
cambio (open.er-api.com) **no necesitan cuenta**: se eligieron así para que la
funcionalidad no dependa de que alguien renueve una key gratuita.

---

## 12. Lo que NO está hecho, dicho claro

- **No hay herramienta de borrado administrativo** (usuarios, publicaciones).
  El mecanismo de confirmación existe y está probado, pero registrar esas
  herramientas es una decisión de producto aparte.
- **Las tasas de cambio son de referencia**, no la TRM oficial de la
  Superintendencia Financiera. No sirven para contabilizar y la herramienta se
  lo dice al modelo.
- **La cancelación del stream no ahorra cuota de Gemini**: corta la lectura del
  lado del cliente, pero la generación sigue corriendo en Google. Es una
  limitación documentada del SDK.
- **El pronóstico ("¿va a llover mañana?") no está**: `consultar_clima` solo
  devuelve el clima actual. Open-Meteo sí expone pronóstico; es una ampliación
  directa de `copiloto.internet.js` cuando se quiera.
- **La búsqueda web sin key es pobre.** Está dicho arriba y vale repetirlo: si
  se quiere que Skynet responda de verdad preguntas de actualidad, hay que
  configurar Tavily o Brave.
