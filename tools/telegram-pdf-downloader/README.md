# Telegram PDF Downloader — artículos de medicina

Programa local que revisa tus grupos de Telegram, descarga los PDFs de
artículos médicos, los renombra como `Año - Revista - Título.pdf` y los
archiva por temática en carpetas (que pueden vivir dentro de Google Drive).

Cómo funciona por dentro, en orden:

1. **Telegram** (Telethon, con tu propia cuenta): recorre los grupos
   configurados y baja los PDFs nuevos. Guarda el punto de avance por grupo,
   así cada corrida solo revisa lo que llegó después de la anterior.
2. **Deduplicación**: hash SHA-256 de cada archivo; el mismo paper reenviado
   en otro grupo no se guarda dos veces.
3. **Metadatos**: extrae el texto de la primera página (PyMuPDF), busca el
   DOI y consulta CrossRef (gratis, sin clave) para obtener título, revista
   y año canónicos.
4. **Clasificación** (opcional, API de Claude): una sola llamada confirma los
   metadatos y elige la categoría temática entre las que definas en
   `config.yaml`. Sin clave de API, el programa funciona igual usando solo
   CrossRef y deja todo en «Sin clasificar».
5. **Archivo**: renombra y mueve el PDF a `carpeta_destino/<Categoría>/`.

## Instalación (macOS)

Necesitas Python 3.10 o superior (`python3 --version`; si no lo tienes:
`brew install python`).

```bash
cd tools/telegram-pdf-downloader
python3 -m pip install -r requirements.txt
# Opcional pero recomendado: descargas mucho más rápidas
python3 -m pip install cryptg
```

## Configuración

1. **Credenciales de Telegram** (una sola vez, gratis):
   entra a <https://my.telegram.org> con tu número, ve a *API development
   tools*, crea una app cualquiera y copia `api_id` y `api_hash`.

2. **Archivos de configuración**:

   ```bash
   cp .env.example .env            # credenciales (api_id, api_hash, clave de Claude)
   cp config.example.yaml config.yaml  # grupos, carpetas y categorías
   ```

   Edita ambos. En `config.yaml` define tus grupos (debes ser miembro),
   la carpeta destino y las categorías temáticas que quieras como carpetas.

3. **Primer inicio de sesión** (una sola vez, interactivo):

   ```bash
   python3 main.py login
   ```

   Telethon te pedirá tu número y el código que te llega por Telegram.
   La sesión queda guardada en `~/.trama-telegram-pdf/` y no se vuelve a pedir.

## Uso

```bash
python3 main.py run     # revisa los grupos y archiva lo nuevo
python3 main.py status  # resumen de lo ya guardado por categoría
```

La primera pasada por un grupo baja como máximo `limite_historial`
documentos recientes (500 por defecto); pon `0` para bajar el historial
completo — Telegram puede imponer pausas (FloodWait) y el programa las
espera solo, así que la primera corrida larga puede tomar su tiempo.

## Google Drive

No hace falta programar nada: instala
[Google Drive para escritorio](https://www.google.com/drive/download/) y
apunta `carpeta_destino` a una carpeta dentro de tu unidad, por ejemplo:

```yaml
carpeta_destino: "~/Library/CloudStorage/GoogleDrive-tu-correo@gmail.com/My Drive/Articulos Medicina"
```

Drive sincroniza solo todo lo que el programa deje ahí.

## Ejecución automática

Para que corra solo cada 6 horas, usa el agente de `launchd` incluido:
sigue las instrucciones comentadas dentro de
[`launchd/com.trama.telegram-pdf-downloader.plist`](launchd/com.trama.telegram-pdf-downloader.plist).

## Costos y privacidad

- Telegram y CrossRef son gratis.
- La clasificación con Claude usa `claude-haiku-4-5` por defecto: fracciones
  de centavo por artículo (se envían solo los primeros ~6.000 caracteres de
  la primera página). Si prefieres máxima calidad de extracción, cambia
  `clasificacion.modelo` a `claude-opus-5` en `config.yaml`.
- Todo corre en tu máquina; los PDFs nunca salen de tu computador (a Claude
  solo va el texto de la primera página, y solo si configuraste la clave).
- Es tu cuenta personal de Telegram: descarga para tu biblioteca personal;
  redistribuir los PDFs es otra cosa (copyright de las revistas).

## Tests

```bash
cd tools/telegram-pdf-downloader
python3 -m unittest discover tests -v
```
