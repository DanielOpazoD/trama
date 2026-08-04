# Notas → Imprenta: fotos por nota y selección en lote

## El pedido, contra el mapa real

Se pidieron tres cosas: (1) múltiples imágenes en una misma nota, (2) enviar
las de una nota a Imprenta, (3) seleccionar imágenes de varias notas y
enviarlas juntas.

**(1) ya existía de punta a punta** — los anexos son una tabla 1:N por
`(ownerType, ownerId)`, el input del composer es `multiple` y acumula, el
upload va en paralelo y `AttachmentPhotos` renderiza N. El único resto
mono-archivo era el panel genérico de anexos (`AttachmentsPanel` tomaba
`files[0]`: elegir cinco subía una, en silencio). Ese resto se corrigió; el
trabajo real fue (2) y (3), calcado del patrón ya probado
Biblioteca/Recortes → Imprenta.

## Diseño

- **`notesToPdfFiles`** (nuevo, hermano de `recortesToPdfFiles`): lista los
  anexos de cada nota, filtra a `image/*` (una nota también anexa PDFs/audio y
  esos no entran por esta vía), baja con el `fetchBlob` inyectado y devuelve
  `{ files, failures }` sin abortar. `canSendNoteToImprenta` = `hasImages`
  (flag que el servidor calcula con EXISTS): predicado puro compartido por
  tarjeta y barra. Como sus hermanos, NO importa pdf-lib/pdf.js (gate).
- **`captureItemsToPdfFiles`** (nuevo): selección mixta nota+captura,
  **en orden del feed** — Imprenta agrupa imágenes consecutivas en hojas, así
  que el PDF queda como se ve la selección, no ordenado por tipo.
- **`NoteCard`**: acción «Fotos a Imprenta» en el menú, solo si hay handler y
  la nota tiene imágenes (ofrecerla sin fotos prometería en falso).
- **Selección**: `useNotasFeedSelection` deja de exigir `segment==='capturas'`
  (la línea única que excluía a las notas). En modo selección, una nota solo es
  marcable si aporta fotos; las capturas siguen como estaban. El toggle
  «seleccionar» aparece también en escritas/todo (`NotesSelectionToggle`),
  en la misma esquina que en capturas.
- **`NotasImprentaSelectionBar`** (nueva, hermana de `RecorteSelectionBar`):
  una sola acción — enviar. El conteo distingue «N seleccionadas · M con
  fotos» ANTES de enviar, no después con un éxito parcial.
- **`NotasWorld`**: los tres caminos (recortes, nota suelta, selección mixta)
  desembocan en la cola común `deliverFilesToImprenta` extraída del handler de
  recortes: mismos toasts, mismo aviso de «al documento en curso».
- **Ratchet**: `NotasFeedView` estaba 421/430; las dos barras se extrajeron a
  `NotasFeedSelectionBars` y quedó en 429/430 sin subir el tope.

## Validación

- Suite completa: **5303 tests / 779 archivos** en verde.
- `typecheck`, `lint`, `format`, build, budget y 14 gates (incl.
  client-api-contracts, structure-ratchets, architecture) OK.
- **Mutación** (6 sondas, inyectadas y revertidas): sin filtro `image/*` cae;
  orden por tipo en vez de feed cae; `canSelect` de vuelta a capturas cae; la
  barra enviando la selección completa cae; la tarjeta ofreciendo Imprenta sin
  imágenes cae; el control (rename de un tipo interno) queda verde.
- **Navegador (demo)**: nota creada con DOS anexos por el composer (chips
  `verde.png`/`roja.png`); acción «Fotos a Imprenta» en el menú listó, bajó y
  navegó a Imprenta; el toggle «seleccionar» en `todo`, checkbox SOLO en la
  nota con fotos, capturas seleccionables al lado, y la barra «1 seleccionada ·
  Fotos a Imprenta».

### Límites del demo, dichos

El modo prueba no guarda los BYTES de los anexos: sirve un SVG placeholder
para cualquier key («cualquier key sirve un placeholder», `demoMedia.ts`), y
el importador de Imprenta descarta ese SVG — por eso en demo el estudio queda
vacío tras navegar. El eslabón «Imprenta ingiere un PNG real» es el mismo
camino `externalFiles → addFiles → hojas` que Biblioteca y Recortes ya usan en
producción y que este pack no toca. Además el store demo pierde subidas
paralelas (clobber read-modify-write ya documentado en el repo): de dos
anexos persistió uno. Ninguna de las dos cosas ocurre contra el backend real.
