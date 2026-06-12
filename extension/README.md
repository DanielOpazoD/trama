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

## Modos de captura (selector del popup)

El popup tiene un selector segmentado con tres modos; el botón «Guardar»
se adapta al modo elegido:

- **Cita**: el texto seleccionado (o pegado en el cuadro). Es el gesto por
  defecto, también disponible con clic derecho y con el atajo de teclado. Si
  la selección está sobre un **enlace** (p.ej. un titular que linkea a la
  nota), el recorte usa ESE enlace como fuente — apunta al artículo
  subyacente, no a la portada.
- **Artículo**: extrae el contenido principal conservando su **estructura**
  como Markdown (encabezados, listas, citas, enlaces, énfasis), no texto
  plano. También por clic derecho → «Guardar artículo en Trama».
- **Región**: ver más abajo (recorte visual de pantalla).

## Capturar imágenes

- **Capturar región** (botón del popup): atenúa la página y deja arrastrar
  un recuadro sobre lo que quieras; la zona seleccionada se ve nítida y una
  etiqueta muestra sus dimensiones en vivo. Al soltar, recorta el área
  visible, la comprime a WebP y la guarda como recorte. `Esc` cancela.
  Requiere conexión (la imagen no se encola).
- **Guardar imagen**: clic derecho sobre una imagen → «Guardar imagen en
  Trama». **Descarga los bytes** a tu almacenamiento (la imagen sobrevive
  aunque la fuente la borre) y conserva el **link de la página** de origen.
  La primera vez que guardás una imagen de un sitio, Chrome pide permiso solo
  para **ese dominio** (`optional_host_permissions`, on-demand). Si lo denegás
  o la descarga falla, cae a guardar la URL externa de la imagen — nunca se
  pierde la captura.
- **OCR a pedido**: en la app, los recortes con imagen tienen un botón
  «extraer texto» que reconoce el texto de la imagen (worker local) y lo
  incorpora al recorte para hacerlo citable.

## Más gestos de texto

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
  autor) de la pestaña activa, inyectar el recuadro de región y capturar el
  área visible (`captureVisibleTab`) **solo cuando actúas** (clic derecho,
  atajo o popup). No hay lectura pasiva ni en segundo plano de tu
  navegación, y la captura de pantalla solo ocurre tras tu gesto.
- `contextMenus`: la entrada del clic derecho.
- `storage`: token, URL del servidor y la cola de reintento, en
  `chrome.storage.local` de tu navegador. No viajan a ningún lado salvo a
  TU servidor de Trama.
- `alarms`: el reintento periódico de la cola.
- `optional_host_permissions` (`*://*/*`): NO se concede de entrada. Solo se
  pide —por dominio, en respuesta a tu clic— cuando guardás una imagen, para
  poder descargar sus bytes a tu almacenamiento. Podés revocarlo cuando
  quieras en `chrome://extensions`. Sin esto, la imagen se guarda como enlace.
- La extensión solo habla con el servidor que configures. El favicon de la
  fuente se pide al servicio público de Google (solo el dominio, sin datos
  tuyos). Sin analytics, sin terceros.

Revocar acceso: Trama → Configuración → Conectar extensión → revocar token.

## Confirmación al capturar

Cuando capturás con el popup ya cerrado (clic derecho, atajo o región),
además del badge del icono aparece un **toast editorial** abajo a la
derecha de la página confirmando «Guardado en Recortes» (o el motivo si
falló / quedó en cola). En páginas restringidas (chrome://) cae al badge.

## Arquitectura y desarrollo

El service worker es un punto de entrada delgado (`background.js`) que solo
cablea eventos de Chrome; la lógica vive en **ES modules** bajo `lib/`:

- `config.js` — token + servidor.
- `queue.js` — badge + cola offline + clasificación de respuestas.
- `recorte.js` — armado del payload + camino único de guardado.
- `inject.js` — funciones que se **inyectan en la página** (extractores,
  resaltado, overlay de región, toast); autocontenidas y duck-typed.
- `region.js` / `collection.js` / `capture.js` — orquestación por gesto.

Calidad (sin paso de build):

- **Type-check**: `npm run check:extension-types` (y dentro de `typecheck`).
  `extension/tsconfig.json` con `checkJs`; `chrome` queda laxo, se verifica
  NUESTRA lógica. `inject.js` va `@ts-nocheck` (corre en la página).
- **Tests**: `extension/lib/*.test.js` (vitest + happy-dom) cubren los
  extractores (artículo, Markdown, X/Reddit) y la cola/reintento.
- **Lint/format**: parte de `eslint .` y Prettier del repo.

## Iconos

Los PNG de `icons/` se generan con `node extension/icons/generate.cjs`
(sin dependencias: dibuja en un buffer y codifica PNG con zlib nativo).
