# Telegram PDF Downloader — herramienta local independiente

## Problema

El usuario recibe artículos de medicina (PDFs) por varios grupos de Telegram
y quiere: descargarlos automáticamente, renombrarlos como
`Año - Revista - Título.pdf`, clasificarlos por temática en carpetas locales
y, opcionalmente, que esa carpeta viva dentro de Google Drive.

## Piezas

Herramienta nueva y autocontenida en `tools/telegram-pdf-downloader/`
(Python 3.10+, CLI con `login | run | status`):

- `pipeline/telegram_client.py` — Telethon (MTProto, sesión de usuario):
  lee historial completo de los grupos, filtro de documentos, avance
  incremental por `min_id`, FloodWait auto-esperado.
- `pipeline/state.py` — SQLite: puntero de último mensaje por chat (con
  `MAX`, nunca retrocede) y dedupe por SHA-256 del archivo.
- `pipeline/metadata.py` — PyMuPDF (texto de primeras 2 páginas), regex de
  DOI, consulta a CrossRef (título/revista/año canónicos).
- `pipeline/classify.py` — una llamada a la API de Claude con salidas
  estructuradas (`output_config.format` + esquema JSON con enum de
  categorías) resuelve metadatos + categoría a la vez.
- `pipeline/organize.py` — sanitización de nombres, truncado a 150 chars,
  colisiones con sufijo `(n)`, movimiento a `destino/<Categoría>/`.
- `config.example.yaml` / `.env.example` / `launchd/*.plist` / `README.md`
  con guía completa para macOS (my.telegram.org, Google Drive para
  escritorio, launchd cada 6 h).

## Decisiones (y por qué)

- **Telethon (cuenta de usuario), no Bot API**: un bot no ve historial
  previo ni archivos > 20 MB; el usuario ya es miembro de los grupos.
- **DOI + CrossRef primero, Claude después**: los metadatos internos de los
  PDFs suelen ser basura; CrossRef es canónico y gratis. Claude
  (`claude-haiku-4-5` por defecto, aprobado por el usuario en la propuesta;
  configurable a `claude-opus-5`) confirma metadatos cuando no hay DOI y
  elige la categoría. Sin `ANTHROPIC_API_KEY` el programa degrada a
  CrossRef + carpeta «Sin clasificar».
- **Google Drive sin código**: la carpeta destino se apunta a
  `~/Library/CloudStorage/GoogleDrive-*/My Drive/...`; sincroniza la app
  oficial de Drive. Integrar la API de Drive solo agregaba complejidad.
- **Errores por mensaje no frenan la corrida**: se loguean y el puntero
  avanza (un PDF corrupto no bloquea el grupo); el dedupe es por hash, así
  que un reintento manual (reenviar el archivo) siempre es posible.
- **Deliberadamente NO tocado**: nada de `src/`, `netlify/` ni las APIs de
  Trama — es una herramienta hermana en `tools/`, sin dependencias del
  frontend ni de los gates de bundle.

## Validación

- `python3 -m unittest discover tests -v`: **22 tests OK** (sanitización y
  truncado de nombres, colisiones, DOI regex con casos borde, parseo de
  CrossRef con mocks, SQLite puntero/dedupe/resumen, esquema del
  clasificador, parseo de respuesta de Claude, refusal y error de conexión).
- Integración real en sandbox: PDF generado → texto → DOI extraído →
  renombrado → archivado en carpeta temática, todo OK. La llamada en vivo a
  CrossRef quedó bloqueada por el proxy del sandbox (403), y el pipeline
  degradó limpio como está diseñado; en un Mac sin proxy funciona directo.
- **Pendiente de verificar en producción** (requiere credenciales reales del
  usuario): login de Telethon, descarga desde un grupo real y llamada real a
  la API de Claude.
- Suite web de Trama no ejecutada: el pack no toca código TS/JS ni assets
  del bundle (solo agrega `tools/` y este doc).
