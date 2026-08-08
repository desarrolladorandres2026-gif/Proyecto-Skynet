# Skynet como asistente global del escritorio

Fecha: 2026-08-08. Estado: implementado; verificado todo salvo la voz real
(esta máquina no tiene micrófono — ver §7, honestidad sobre lo probado).

---

## 1. Por qué esto no se podía hacer desde la web

Una página web **no puede escuchar el micrófono cuando está cerrada**. No es una
carencia de este proyecto ni algo que se arregle con un permiso: no existe
ninguna API de navegador que lo permita.

- `getUserMedia` y la Web Speech API exigen un **documento vivo**. Al cerrar la
  pestaña, el documento se destruye y con él la captura.
- Los **Service Workers** —lo único que un navegador ejecuta en segundo plano—
  no tienen `navigator.mediaDevices`. Ni instalando la app como PWA.
- Aunque la pestaña siga abierta pero en segundo plano, Chromium **ralentiza los
  temporizadores** y corta el reconocimiento continuo.

Esa última línea ya estaba documentada en el propio código desde antes:

> *"el navegador corta el reconocimiento continuo cada cierto tiempo y cuando la
> pestaña deja de estar en primer plano […] «Oye Skynet» funciona con la app
> abierta en pantalla, no en segundo plano."*
> — `useReconocimientoVoz.js`

Por eso la única vía real es un proceso de escritorio. Lo que sigue es cómo se
hizo **sin duplicar nada**.

---

## 2. Qué se añadió y qué se reutiliza

```
┌──────────────────────────────────────────────────────────┐
│  escritorio/  (NUEVO — proceso principal de Electron)    │
│  bandeja · atajo global · autoarranque · ventana oculta  │
└───────────────────────────┬──────────────────────────────┘
                            │ carga por http la MISMA URL
                            ▼
┌──────────────────────────────────────────────────────────┐
│  frontend/  ── ruta /asistente ──  (el panel de siempre)  │
│  useVoiceAssistant · useHablar · api/copiloto.js          │
└───────────────────────────┬──────────────────────────────┘
                            │ misma cookie, mismo endpoint
                            ▼
┌──────────────────────────────────────────────────────────┐
│  Backend/  ── SIN CAMBIOS ──                              │
│  Gemini · Tool Engine · permisos · confirmaciones · audit │
└──────────────────────────────────────────────────────────┘
```

**El backend no se tocó. Ni una línea.**

La app de escritorio es una ventana de Chromium que carga el panel **desde la
misma URL** que el navegador. De ahí hereda, sin copiar nada:

| Qué | De dónde sale |
|---|---|
| Sesión | La cookie httpOnly del backend. La app **no guarda ningún token**. |
| Llamadas al chat | `frontend/src/api/copiloto.js`, tal cual |
| Gemini, herramientas, permisos, auditoría | El backend, por el mismo endpoint |
| Wake word, modos de escucha, TTS | Los mismos hooks de React |

Lo único que aporta el proceso principal es lo que un navegador no puede dar:
vivir en la bandeja, un atajo global y una ventana que **sigue procesando audio
con el panel cerrado**.

---

## 3. Las tres decisiones que lo hacen funcionar

### `backgroundThrottling: false`

Es *la* línea. Chromium ralentiza temporizadores y suspende trabajo en ventanas
no visibles — exactamente lo que rompe el wake word en una pestaña de fondo.
Desactivarlo mantiene el bucle de audio a velocidad normal con la ventana
oculta. Sin esto, la app de escritorio tendría el mismo problema que la web.

### `showInactive()` en vez de `show()`

Si el orbe robara el foco, hablarle a Skynet interrumpiría lo que la persona
esté escribiendo en otro programa. Un asistente global que te roba el cursor no
es utilizable.

### La ventana carga una **ruta de la app web**, no un HTML propio

Es lo que hace que herede la sesión: mismo origen ⇒ misma cookie. Un HTML
propio dentro de Electron habría exigido inventar un segundo login y guardar un
token en disco — más código, más superficie y peor seguridad.

---

## 4. Dos motores de voz, una sola lógica

La Web Speech API **no funciona dentro de Electron**: Chromium no transcribe por
sí solo, manda el audio a un servicio de Google cuya clave viene compilada en
las builds oficiales de Chrome y no en las de Electron. Ahí
`webkitSpeechRecognition` falla con `error: 'network'`.

Así que en el escritorio se usa **Vosk** (WebAssembly, offline). Pero eso no
duplicó nada:

```js
// useReconocimientoVoz.js — ESTA es toda la ramificación
const SpeechRecognition = esEscritorio() ? ReconocedorVosk : SpeechRecognitionWeb
```

`ReconocedorVosk` **imita la forma de `SpeechRecognition`** (`start`, `stop`,
`onresult` con `results[i][0].transcript` e `isFinal`, `onerror`, `onend`). El
hook no sabe cuál está usando. Toda la inteligencia —detectar "Oye Skynet", los
tres modos, el vigilante de cuelgues, el reinicio automático— sigue en un solo
sitio.

Es un **adaptador**, no un segundo cerebro.

| | Navegador | Escritorio |
|---|---|---|
| Motor | Web Speech API | Vosk (WASM) |
| Dónde se transcribe | Servidores de Google | **En el equipo** |
| Funciona sin internet | No | **Sí** |
| En segundo plano | No | **Sí** |

Como beneficio no buscado: en el escritorio **el audio nunca sale del equipo**,
que era justo la razón por la que el wake word era opt-in en la web.

---

## 5. Instalación

```bash
cd escritorio
npm install
npm run modelo      # descarga y prepara el modelo de español (~40 MB)
npm run dev         # apunta a http://localhost:5173
```

Para producción: copiar `config.example.json` como `config.json` **junto al
ejecutable** y poner ahí la URL del Skynet desplegado.

### El modelo de voz

Alphacephei publica los modelos en `.zip`; `vosk-browser` los carga como
`.tar.gz`. `scripts/preparar-modelo.mjs` hace la conversión.

Ese script escribe el tar **en Node puro** en vez de llamar a `tar`, y la razón
merece quedar escrita: GNU tar (el que trae Git para Windows) interpreta
`C:\Users\…` como `host:ruta` e intenta **conectarse por red a un equipo
llamado "C"**. Windows trae además bsdtar en System32, que sí lo entiende, así
que el resultado dependía de cuál apareciera antes en el `PATH`. Un formato de
cabeceras de 512 bytes no justifica esa lotería.

El modelo **no se versiona** (`.gitignore`): son 40 MB de binarios que Git
guardaría para siempre en cada versión.

---

## 6. Seguridad

| Decisión | Por qué |
|---|---|
| `contextIsolation` activo (por defecto) | El código servido por la red no ve `require` ni `process`; solo lo que publica `contextBridge` |
| `sandbox: false` | El preload necesita leer el modelo del disco. **No** abre el renderer a Node: `contextIsolation` sigue siendo la protección real |
| Puente estrecho | 11 métodos concretos. Nada de `leerArchivo(ruta)` ni `invoke(canal, datos)`. La única función que toca el disco lee una ruta **fija** que calcula el proceso principal |
| Sin credenciales en disco | La app no guarda usuario, contraseña ni token. Solo la cookie httpOnly, igual que el navegador |
| Permisos acotados | Solo se conceden `media` y `notifications`; el resto se niegan |
| Enlaces externos al navegador | Una ventana de Electron sin barra de direcciones es el sitio ideal para una suplantación |

La sesión dura **8 horas** (el `JWT_EXPIRES_IN` de siempre). Al caducar, la
ventana oculta no puede pedir la contraseña, así que avisa al proceso principal
y este abre el panel de login. No hay refresco de token: añadirlo sería cambiar
el modelo de sesión de todo el sistema, no del asistente.

---

## 7. Qué se probó de verdad y qué no

**Esta máquina no tiene micrófono ni reconocedor de voz nativo de Windows.**
Eso limita lo que se pudo verificar, y conviene ser exacto:

### Verificado ejecutándolo

| Comprobación | Resultado |
|---|---|
| Vosk carga el modelo generado, dentro de Electron | ✅ 1152 ms, motor Kaldi inicializado |
| El recognizer acepta audio (sintético) y libera limpio | ✅ sin errores |
| Ventana oculta carga `/asistente` | ✅ oculta, siempre encima, fuera de la barra de tareas |
| Atajo global `Ctrl+Shift+S` se registra | ✅ |
| El atajo llega hasta React | ✅ |
| Puente del preload completo en el renderer | ✅ 11 métodos |
| Sin sesión, abre el panel de login | ✅ |
| Bandeja e icono | ✅ |
| Build del frontend, 23 pruebas front, 211 back, lint | ✅ |

### NO verificado — requiere micrófono

- Que Vosk transcriba **habla real en español** con precisión utilizable.
- Que `detectarActivacion()` reconozca "Oye Skynet" con la salida de Vosk. El
  patrón fonético se ajustó para las deformaciones de la Web Speech API en
  es-CO; **Vosk puede deformar la palabra de otra manera** y el patrón quizá
  necesite ajuste. La consola registra cada frase oída (`[Skynet wake] escuchó:
  …`), que es justo la herramienta para calibrarlo.
- El barge-in (interrumpir a Skynet diciendo "oye Skynet" mientras habla).
- La cancelación de eco con el altavoz real.

Para eso está **Diagnóstico** (bandeja → Diagnóstico): comprueba micrófono,
permisos de Windows, modelo, backend, sesión y atajo, y dice dónde se arregla
cada cosa.

---

## 7 bis. Las voces de lectura: por qué se ven menos que en el navegador

Es la primera diferencia que se nota al abrir el `.exe`, y no es un fallo.

Windows guarda las voces en **dos registros distintos** y cada motor mira uno:

| Registro | Voces en este equipo | Quién lo usa |
|---|---|---|
| `Speech\Voices` (SAPI5) | Zira (en-US), Sabina Desktop (es-MX) | `System.Speech` de .NET |
| `Speech_OneCore\Voices` | **Raul (es-MX), Sabina (es-MX)** | **Chromium, o sea Electron** |

El asistente ve las dos de OneCore, las dos en español, y el selector filtra a
español — de ahí las **2** que aparecen.

En el navegador se ven más porque **Chrome añade voces de Google que funcionan
por internet** ("Google español", etc.), y esas vienen con las claves de API
compiladas en Chrome. Electron no las tiene: es exactamente la misma causa por
la que la Web Speech API tampoco reconoce voz ahí (§4).

Para tener más: Configuración de Windows → Hora e idioma → Voz → Administrar
voces → Agregar voces. Son locales, gratuitas y offline. Ojo: **no existe una
voz de Windows en es-CO**; las de es-MX (Sabina, Raul) son las más cercanas al
público del Terminal, y son justo las que ya están.

### Bug encontrado al investigar esto

`cargarVoces()` en `useHablar.js` esperaba el evento `voiceschanged` con un
único `setTimeout` de 1 s de respaldo. Medido contra Electron: el evento **no
llega a dispararse** y las voces aparecen entre 1 y 2 segundos después de
cargar. Ese timeout caía justo en medio de la ventana, así que unas veces leía
las voces y otras una lista vacía — y al perder la carrera, Skynet hablaba con
la voz por defecto del sistema (en inglés) o no hablaba.

Corregido sondeando hasta que aparezcan (250 ms, tope de 8 s) en vez de apostar
a un tiempo fijo. El camino rápido por evento se conserva para el navegador.

---

## 8. Limitaciones conocidas

- **Solo Windows** por ahora. El código de Electron es portable, pero el
  empaquetado y las rutas de permisos están escritos para Windows.
- **La app pesa ~200 MB** instalada (Chromium) más 40 MB de modelo.
- **La sesión caduca a las 8 horas** y hay que volver a iniciarla en el panel.
- **El wake word gasta CPU de forma continua** mientras está encendido: Vosk
  procesa todo el audio localmente. Por eso va apagado por defecto.
- El asistente **no responde con el panel cerrado si nunca se inició sesión**:
  la primera vez hay que abrir el panel e identificarse.
