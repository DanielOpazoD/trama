# Trama — Recortes (extensión de Chrome)

Guarda texto de cualquier página directo en la bandeja de **Recortes** de
Trama. Nada entra a tu trama sin tu curaduría: todo aterriza como
`pendiente` y desde la app decides qué se vuelve cita, entidad o momento.

## Instalación (modo desarrollador)

1. Abre `chrome://extensions`, activa **Developer mode**.
2. **Load unpacked** → elige esta carpeta (`extension/`).
3. En Trama: **Configuración → Conectar extensión → generar token**.
   Copia el token (se muestra una sola vez).
4. Clic en el icono de la extensión → pestaña **conexión** → pega el token
   y pulsa **Probar conexión** para confirmar. El servidor por defecto es
   `https://tramahub.app`.

## Uso

- **Clic derecho** sobre texto seleccionado → «Guardar selección en Trama».
- **Atajo de teclado**: `⌘⇧S` (Mac) / `Ctrl+Shift+S` — guarda la selección
  sin abrir menús. (Personalizable en `chrome://extensions/shortcuts`.)
- O el **popup**: precarga la selección y la fuente (favicon + dominio),
  deja agregar una nota y guardar.
- El badge del icono confirma: ✓ guardado · número = capturas en cola.

## Capturar más que una selección (Bloque B)

- **Artículo completo**: clic derecho en la página → «Guardar artículo en
  Trama», o el botón «artículo completo» del popup. Extrae el texto
  principal del long-read (heurística readability-lite, sin dependencias).
- **Imagen**: clic derecho sobre una imagen → «Guardar imagen en Trama».
  El recorte guarda la imagen (se ve en la bandeja).
- **Colección (varios resaltados → un recorte)**: «Añadir a la colección
  de Trama» (clic derecho o el botón del popup) va sumando fragmentos; el
  popup muestra la cuenta y permite «guardar colección» (todos juntos como
  un solo recorte) o «vaciar». El badge naranja lleva la cuenta.
- **Captura estructurada de X y Reddit**: al guardar en x.com o reddit.com,
  la extensión extrae autor + texto + permalink limpios del tweet/post que
  contiene tu selección (best-effort; si el DOM cambió, cae a la selección).

## Robustez — ninguna captura se pierde

El service worker de Manifest V3 es efímero y la red puede fallar. Por eso:

- El payload se arma **completo en el momento** de capturar (texto + meta
  de la página), porque al reintentar la pestaña ya puede no existir.
- Si el envío falla por falta de red, error del servidor o token, la
  captura entra a una **cola en `chrome.storage.local`** y un _alarm_ la
  reintenta cada minuto. La cola sobrevive a que Chrome mate el worker.
- Cuando vuelve la conexión (o arreglas el token), la cola se vacía sola.

## Permisos y privacidad

- `activeTab` + `scripting`: leer la selección y los meta tags (título,
  autor) de la pestaña activa **solo cuando actúas** (clic derecho, atajo
  o popup). No hay lectura pasiva ni en segundo plano de tu navegación.
- `contextMenus`: la entrada del clic derecho.
- `storage`: token, URL del servidor y la cola de reintento, en
  `chrome.storage.local` de tu navegador. No viajan a ningún lado salvo a
  TU servidor de Trama.
- `alarms`: el reintento periódico de la cola.
- La extensión solo habla con el servidor que configures. El favicon de la
  fuente se pide al servicio público de Google (solo el dominio, sin datos
  tuyos). Sin analytics, sin terceros.

Revocar acceso: Trama → Configuración → Conectar extensión → revocar token.

## Iconos

Los PNG de `icons/` se generan con `node extension/icons/generate.cjs`
(sin dependencias: dibuja en un buffer y codifica PNG con zlib nativo).
