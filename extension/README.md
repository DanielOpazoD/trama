# Trama — Recortes (extensión de Chrome)

Guarda texto de cualquier página directo en la bandeja de **Recortes** de
Trama. Nada entra a tu trama sin tu curaduría: todo aterriza como
`pendiente` y desde la app decides qué se vuelve cita, entidad o momento.

## Instalación (modo desarrollador)

1. Abre `chrome://extensions`, activa **Developer mode**.
2. **Load unpacked** → elige esta carpeta (`extension/`).
3. En Trama: **Configuración → Conectar extensión → generar token**.
   Copia el token (se muestra una sola vez).
4. Clic en el icono de la extensión → pestaña **conexión** → pega el token.
   El servidor por defecto es `https://tramahub.app`.

## Uso

- **Clic derecho** sobre texto seleccionado → «Guardar selección en Trama».
- O el **popup**: precarga la selección, deja agregar una nota y guardar.
- El badge del icono confirma: ✓ guardado · ! error (token o conexión).

## Permisos y privacidad

- `activeTab` + `scripting`: leer la selección y los meta tags (título,
  autor) de la pestaña activa **solo cuando actúas** (clic derecho o popup).
  No hay lectura pasiva ni en segundo plano de tu navegación.
- `contextMenus`: la entrada del clic derecho.
- `storage`: token y URL del servidor, en `chrome.storage.local` de tu
  navegador. No viajan a ningún lado salvo a TU servidor de Trama.
- La extensión solo habla con el servidor que configures. Sin analytics,
  sin terceros.

Revocar acceso: Trama → Configuración → Conectar extensión → revocar token.
