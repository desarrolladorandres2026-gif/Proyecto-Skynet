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

La primera vez hay que abrir el panel e iniciar sesión. La sesión dura 8 horas.

## Configuración

Copia `config.example.json` como `config.json` **junto al ejecutable** (no en
esta carpeta) y ajusta `url`, `atajo`, `wakeWord` y `autoArranque`.

En desarrollo se puede usar `SKYNET_URL` y `SKYNET_ATAJO` como variables de
entorno.

## Si algo no funciona

Abre **Diagnóstico** desde la bandeja: comprueba micrófono, permisos de
Windows, modelo de voz, servidor, sesión y atajo, y te dice dónde se arregla
cada cosa. El asistente falla de formas mudas —la ventana que escucha está
oculta— así que esa pantalla existe precisamente para eso.

## Empaquetar

```bash
npm run empaquetar    # instalador NSIS para Windows
```
