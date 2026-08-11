# Skynet — asistente de escritorio

Hace que Skynet escuche y responda **aunque el panel web esté cerrado**,
desde cualquier ventana del computador.

No es un Skynet aparte: es una ventana que carga el panel de siempre desde la
misma URL, así que comparte sesión, Gemini, herramientas y permisos. Lo único
que aporta es lo que un navegador no puede dar — bandeja del sistema, atajo
global y escucha en segundo plano.

El diseño completo y por qué está en
[`docs/arquitectura/04-asistente-escritorio.md`](../docs/arquitectura/04-asistente-escritorio.md).

## Puesta en marcha

```bash
npm install
npm run modelo    # descarga el modelo de voz en español (~40 MB, una sola vez)
npm run dev       # apunta a http://localhost:5173
```

Necesitas el backend y el frontend corriendo (`npm run dev` en cada uno).

## Uso

| Acción | Cómo |
|---|---|
| Hablar con Skynet | `Ctrl+Shift+S` desde cualquier ventana, o clic en la bandeja |
| Abrir el panel | Menú de la bandeja → Abrir el panel |
| Ver qué falla | Menú de la bandeja → **Diagnóstico** |
| Manos libres | Menú de la bandeja → Escuchar "Oye Skynet" |
| Arrancar con Windows | Menú de la bandeja → Arrancar con Windows |
| Actualizar ya | Menú de la bandeja → Versión X — buscar actualizaciones |

La primera vez hay que abrir el panel e iniciar sesión. La sesión dura 8 horas.

## Configuración

**El Skynet instalado ya viene apuntando a `https://skynetttn.online`**, así que
no hace falta configurar nada para que funcione: el frontend llama al backend
con rutas relativas (`/api`) y nginx las enruta al Express de PM2. Con acertar
esa única URL, quedan resueltos panel, API, sesión y archivos.

Solo si hace falta desviar un equipo (a un servidor de pruebas, o apagarle las
actualizaciones), copia `config.example.json` como `config.json` **junto al
ejecutable** — normalmente `C:\Program Files\Skynet\config.json`.

En desarrollo se usa `SKYNET_URL` y `SKYNET_ATAJO` como variables de entorno.
Sin nada de eso, `npm run dev` apunta a `localhost:5173` y el `.exe` instalado a
producción: lo decide `app.isPackaged`, no un valor escrito a mano.

## Si algo no funciona

Abre **Diagnóstico** desde la bandeja: comprueba micrófono, permisos de
Windows, modelo de voz, servidor, sesión y atajo, y te dice dónde se arregla
cada cosa. El asistente falla de formas mudas —la ventana que escucha está
oculta— así que esa pantalla existe precisamente para eso.

## Empaquetar y publicar una versión

El instalador sale en la carpeta `instalable/` de la raíz del proyecto.

```bash
# 1. Sube el número de versión en package.json (1.0.0 → 1.0.1).
#    Sin esto los equipos NO se actualizan: la app compara versiones, y una
#    igual a la instalada significa "ya estás al día".
npm version patch --no-git-tag-version

# 2. Empaqueta
npm run empaquetar

# 3. Publica al VPS (pide la contraseña/llave SSH)
npm run publicar
```

Eso deja en `instalable/` tres archivos que van juntos:

| Archivo | Para qué |
|---|---|
| `Skynet-Instalador-X.Y.Z.exe` | Instalación desde cero, en un equipo nuevo |
| `latest.yml` | El "catálogo": versión y hash. Es lo que consultan los equipos |
| `...exe.blockmap` | Permite bajar solo los trozos que cambiaron |

### Cómo llegan las actualizaciones a los equipos

Igual que Windows Update, y por el mismo mecanismo que usan VS Code o Slack
([electron-updater](src/actualizador.js)):

1. Cada 6 h (y 15 s después de arrancar) la app pide
   `https://skynetttn.online/descargas/latest.yml`.
2. Si la versión de ahí es mayor que la instalada, descarga el `.exe` en
   segundo plano y comprueba su hash.
3. Avisa por notificación y aparece **Reiniciar para actualizar** en la bandeja.
4. Si nadie hace clic, **se instala sola la próxima vez que se cierre Skynet**.

Nunca reinicia el programa por sorpresa: cortaría un dictado a media frase.

**Primera vez en el VPS**, crear la carpeta que sirve nginx:

```bash
mkdir -p /home/prueba/skynet-descargas
# y recargar nginx con el bloque /descargas/ de deploy/nginx/skynetttn.conf
```

### Si el empaquetado falla con "Cannot create symbolic link"

```
ERROR: Cannot create symbolic link : El cliente no dispone de un privilegio
requerido. : ...\Cache\winCodeSign\<números>\darwin\10.12\lib\libcrypto.dylib
```

No es un problema de Skynet. electron-builder descarga un paquete de
herramientas de firma que **incluye binarios de macOS con enlaces simbólicos**,
y Windows no deja crearlos sin permisos de administrador. Se queda reintentando
y nunca llega a generar el instalador (deja solo `instalable/win-unpacked/`).

La solución de una vez por todas es activar el **Modo de desarrollador**:
*Configuración → Privacidad y seguridad → Para desarrolladores → Modo de
desarrollador*. Eso permite crear enlaces simbólicos sin ser administrador.

Sin tocar Windows, se puede extraer la caché a mano saltando la carpeta de
macOS, que en este equipo no se usa para nada:

```bash
cd "$LOCALAPPDATA/electron-builder/Cache/winCodeSign"
../../../../..//path/to/7za.exe x <cualquier>.7z -o"winCodeSign-2.6.0" -xr'!'darwin -y
# 7za está en escritorio/node_modules/7zip-bin/win/x64/7za.exe
```

> **Nota sobre SmartScreen.** El instalador no está firmado digitalmente, así
> que Windows muestra "Se protegió el equipo" la primera vez (hay que pulsar
> *Más información → Ejecutar de todas formas*). Las actualizaciones posteriores
> no lo muestran, porque las aplica el propio Skynet ya instalado. Quitarlo del
> todo exige comprar un certificado de firma de código a nombre del Terminal.
