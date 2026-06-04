# Dominios — grafo, chat, Momentos y derivados

## Cuando edites el grafo

`src/components/GraphView.tsx` es solo composición. La lógica está en:

- `src/hooks/useGraphLayout.ts` — orquesta los cuatro modos y persiste solo en `organic`
- `src/hooks/layouts/{organic,byType,byYear,byDegree}.ts` — funciones puras
- `src/hooks/usePanZoom.ts` — drag, pan, zoom, screenToWorld
- `src/components/graph/{GraphNode,GraphEdge,GraphToolbar}.tsx` — render

Para agregar un layout nuevo (radial, jerárquico, etc.): crear `src/hooks/layouts/<name>.ts` como función pura, añadirlo al union `LayoutMode` en `layouts/types.ts`, agregarlo al `if` de `useGraphLayout`, y añadir la opción en `GraphToolbar`. Tests del layout van en `<name>.test.ts` co-localizado.

**Solo el modo orgánico persiste posiciones.** Los otros tres recalculan determinísticamente — si arrastrás en ellos, el cambio es ephemeral y se pierde al cambiar de modo. Eso es a propósito.

## Cuando edites el chat

`src/components/ChatView.tsx` es la vista entera (rail de hilos + conversación + input). Las propuestas inline las renderiza `src/components/chat/InlineProposal.tsx`.

El streaming funciona así:

1. `useSendChatMessage(threadId)` expone `{ send, pending, error }`.
2. `send(content)` agrega bubbles optimistas (user real + assistant vacío), llama `api.streamChatMessage` con callbacks, y mientras llegan chunks muta el content del bubble assistant.
3. Al `done` recibe el message persistido (con id real y `proposal`), y lo swappea por el bubble optimista.
4. Si `error`, drop del bubble assistant y mostrar el mensaje.

El bloque `<<<TRAMA-PROPOSAL ... TRAMA-PROPOSAL>>>` que sale al final del texto se parsea en el SERVIDOR (`parseChatReply` en `_lib/chat-validate.ts`) — el cliente recibe el prose ya limpio + el objeto `proposal` aparte. El usuario nunca ve el JSON crudo.

## Cuando edites Momentos (ξ — la dimensión temporal)

Momentos es el dominio donde vive la **memoria fechada** de la trama: notas sueltas del día, recortes del mundo (tweets, links, screenshots), y fotos. Es el contrapeso temporal a entidades+citas que son atemporales.

**Tabla:** `momentos` con `kind ∈ {nota, recorte, foto}` + `payload jsonb` variante por kind + `captured_at` separado de `created_at` (importante: una foto subida hoy puede tener captured_at de hace 5 años). Junction `momento_entities` N:M con entidades.

**Shape de `payload` por kind** (validación en `src/schemas/momento.ts` — Zod):

- `nota`: `{ bodyText: string }` (requerido)
- `recorte`: `{ url?, title?, bodyText?, source?, author? }` — al menos uno de url/title/bodyText
- `foto`: `{ storageKey, width, height, caption?, exifDate? }` o `{ items: [{storageKey, ...}] }` (υ-multi)

**Backend** (un endpoint por path, con multi-method handler):

- `/api/momentos` GET/POST y `/api/momentos/:id` GET/PATCH/DELETE — CRUD principal
- `/api/momentos-url-preview?url=` — server-side fetch de og:title/description/source/author
- `/api/momentos-upload` — multipart/form-data imagen → Netlify Blobs store `momentos-media`, key `${userId}/${hash}.${ext}`
- `/api/momentos-audio-upload` — multipart/form-data audio → mismo store, key `${userId}/${hash}.${ext}`
- `/api/momentos-file/:userId/:key` y `/api/momentos-file/:key` legacy — sirve el blob con auth por namespace y headers `private, no-store`; keys legacy sin slash solo para `legacy-single-user`
- `/api/momentos-orphaned-blobs` GET/POST — DD1: lista blobs no referenciados desde momentos en la BD actual + adopta uno creando un Momento foto. Recovery de uploads desde deploy previews
- `/api/momentos-merge` POST — EE: fusiona N momentos foto en uno. CTE atómico que combina UPDATE primary (payload con `items[]` dedupeado por storageKey) + INSERT links (union entity_ids) + soft-delete others. Devuelve `deletedOthers: [{id, deletedAt}]` para "deshacer"
- `/api/momentos-restore` POST — EE-followup: restaura un Momento soft-deleted. Body `{id, deletedAt}`; 409 si el deletedAt no matchea (defensa contra race con re-delete)

> **Patrón de paths Momentos:** todos los sub-endpoints usan `momentos-X` (hyphen) en vez de `/api/momentos/X` porque el handler de `momentos.mts` matchea `/api/momentos/:id` y trataría "X" como un id. El bug de upload 405 (υ-bugfix) es la razón histórica.

**Frontend** vive en `src/components/momentos/`:

- `MomentosView.tsx` — orquestador delgado (<200 líneas)
- `MomentoComposer.tsx` + `useMomentoComposer.ts` — form con 3 branches por kind
- `MomentoLinkingPanel.tsx` + `useMomentoLinking.ts` — panel post-guardar con AI suggest
- `MomentoEntry.tsx` — renderer del timeline (despacha por kind)
- `AlbumGrid.tsx` — vista grid alternativa para fotos
- `MomentosFilters.tsx` — chips de filtro + toggle vista
- `helpers.ts` — `groupByDay`, `groupByMonth`, `formatDateHeading`, `readImageDimensions`

**Reglas específicas:**

- **NO cambies `kind` via PATCH** — requeriría re-encoding del payload entero. Si necesitás eso, borrá y recreá.
- **PATCH solo re-embedea si cambió `payload` o `note`** (no en cada link de entityIds). El handler decide con `shouldReembed`.
- **Validá el payload con `validateMomentoPayload` en POST y PATCH** — protege contra `foto` sin storageKey, `nota` vacía, etc.
- **Fotos y audios viven en Netlify Blobs, no en Postgres.** El payload guarda `storageKey`/`audioKey` namespaced por usuario (`${userId}/${hash}.${ext}`). Para servir, el cliente construye `/api/momentos-file/:userId/:key` segmentando la key; legacy sin slash usa `/api/momentos-file/:key`. La key es inmutable, pero la respuesta HTTP usa `Cache-Control: private, no-store` porque es media privada.
- **Vision base64: usar `Buffer.from(arrayBuffer).toString('base64')`**, NO `btoa(String.fromCharCode(...))` que se rompe con imágenes >2MB.
- **Cuando fusiones Momentos (`momentos-merge`), usá CTE atómico** — el driver Neon HTTP no soporta tx multi-statement, pero un single SQL con `WITH update_primary AS (...), link_others AS (...), soft_delete_others AS (...) SELECT ...` da atomicidad real. Si una sub-operación falla, ninguna commitea.
- **UUID validate en código antes del SQL** para endpoints que reciben ids en body. Sin esto, un id mal formado revienta con 500 en el cast `::uuid` en vez del 400 claro que querés.
- **Recovery de blobs huérfanos:** los deploy previews tienen BD-rama ephemeral pero el store de Blobs es global. Si subís en preview, los blobs sobreviven pero los Momentos no. Usar `/api/momentos-orphaned-blobs` desde Settings → Datos para recuperarlos.

## Cuando edites Tareas (recordatorios semanales)

Tareas son recordatorios livianos del mundo Notas agrupados por **semana**: cada cuadro es una hoja semanal (título = rango de fechas) y cada línea un recordatorio con su color de prioridad.

**El dominio puro vive en `src/components/notas/weekModel.ts`** — NO repliques esa lógica dentro de las vistas (esa fue toda la deuda que centralizamos). Funciones puras, testeadas sin DOM ni red en `weekModel.test.ts`:

- `rawTaskWeek` / `effectiveWeek` — a qué semana pertenece, con el arrastre aplicado.
- `groupTasksByWeek`, `splitByStatus(items, sortMode)`, `sortPending`, `pendingMonthsForYear`.
- `taskCategory(t)`, `filterByCategory(items, cat)`, `countPendingByCategory(items)` + `DEFAULT_CATEGORY`.

**Arrastre (carry-over):** un pendiente NO completado de una semana anterior se muestra en la semana actual (`effectiveWeek`); las hechas quedan en su semana. Al completar un arrastrado se fija `weekStart = semana actual` (queda registrado como hecho esta semana, no en la vieja). Esa decisión vive en `TareasView` (`onToggle`).

**Carga por rango, no todo:** `useTasksRange({ weekFrom, weekTo, carryBefore })` trae solo el mes visible + los pendientes que se arrastran (`carryBefore` = semana actual cuando el mes navegado es el corriente). Los puntos del navegador usan `usePendingTasks()` (lista liviana de solo-pendientes). Nunca cargar la tabla entera para pintar un mes.

**Categoría (pestañas Trabajo / Personal):** columna `category ∈ {trabajo, personal}`, `DEFAULT 'trabajo'` — las tareas antiguas (anteriores a la columna) quedan en Trabajo sin tocar nada. Cada cuadro recuerda su pestaña activa; la inactiva muestra un contador tenue de pendientes. El literal `'trabajo'` vive en UN solo lugar (`DEFAULT_CATEGORY`): usá `taskCategory()`/`filterByCategory()`, no el fallback suelto.

**Backend** `netlify/functions/tasks.mts` (multi-method, schemas Zod en `_lib/task-schemas.ts`):

- El `RETURNING`/`SELECT` lista TODAS las columnas (incluida `category`); si agregás una, tocá las ~6 queries.
- El INSERT pone defaults con `COALESCE`: `priority → 'media'`, `category → 'trabajo'`, `week_start → date_trunc('week', NOW())`.
- El PATCH usa el patrón `campo = CASE WHEN ${body.x !== undefined} THEN ${body.x ?? null} ELSE campo END` para distinguir "no vino" de "vino null".
- Las `#etiquetas` se derivan en el server de título+detalle (`tagsFor`), nunca del cliente.

**Estado** en `src/state/useTasks.ts`: `applyPatch` refleja el patch en cache (optimista) y las mutaciones invalidan `['tasks']` + cronologia + home. **Fotos** por semana (`owner_id` = fecha) y por tarea (`owner_id` = task.id) van por `notas-attachments-*` como el resto de anexos.

## Dominios derivados y operacionales

- **Mutaciones multi-tabla → un solo CTE (atomicidad).** El driver HTTP de Neon no da transacciones multi-statement, así que una operación que toca varias tablas (merge, cascade soft-delete + su restore, crear+linkear) se escribe como UN `WITH … RETURNING` único: Postgres lo ejecuta atómico (todo o nada) y los `WITH` que modifican datos corren a término aunque el `SELECT` final no los referencie. Patrón aplicado en `momentos-merge`, `entities-merge`, el DELETE/restore de `entities` y el POST de `momentos` (momento + links). Ojo con la semántica de snapshot: los CTE NO se ven entre sí, así que pasos dependientes del orden (p. ej. reasignar relaciones y luego quitar self-loops) se combinan en un mismo `UPDATE … CASE` que toca cada fila una sola vez. **Regresión:** `scripts/check-cte-regression.sql` (vía `npm run check:cte-regression` y el job `migrations` de CI) ejecuta estos CTE contra Postgres real — los tests de endpoint mockean el SQL y no los ejercitan. Si tocás un CTE en un handler, actualizá su copia en ese archivo.
  - **Excepciones auditadas:** el soft-delete de `quotes` es de una sola tabla (no cascadea) y su re-embed en PATCH es fire-and-forget intencional (dato derivado) — no necesita CTE. El PATCH de `momentos` (re-embed condicional + diff de links) es multi-write pero de baja severidad y demasiado ramificado para un solo CTE seguro; se deja secuencial a propósito.
- **Editor de imágenes (compartido).** `editImage(file, { outputType, title }): Promise<File | null>` (`src/lib/imageEditor`) abre un modal simple —recortar, girar 90°, texto (fuente/tamaño/negrita/color)— y resuelve con el File editado, el original (si no hubo cambios) o `null` (cancelar). Se carga PEREZOSO (chunk aparte, fuera del bundle principal) y nunca rompe la subida: ante cualquier fallo devuelve el File original. Corre ANTES de `compressImage` en cada flujo. La matemática vive pura y testeada en `imageEditor/transforms.ts`; el resto (`raster.ts`, `mount.tsx`, `index.ts`, `components/imageEditor/**`) es canvas/Pointer Events browser-only, excluido del coverage. El texto se ancla a la imagen COMPLETA (posición y tamaño físicos): el recorte reencuadra/acerca pero no reubica el texto, así preview y export coinciden (`textPxOnCrop`); el texto fuera del recorte se atenúa en el preview y queda fuera del lienzo final. El halo usa la misma técnica de contorno en ambos lados (`paint-order: stroke` en el preview ≡ `strokeText` en el raster). **Integración (opt-in por imagen):** `AttachmentPhotos` (adjuntar es un clic sin editor; clic en la miniatura abre `AttachmentLightbox` —visor continuo de las fotos de esa semana/tarea, flechas + teclado, wrap— cuyo botón "editar" baja el blob, lo edita, sube la nueva y borra la vieja, y reposiciona el visor sobre el resultado), `MomentoComposer`/`useMomentoComposer.replacePhotoDraft` (lápiz por draft) y `FotoEditModal` (lápiz por foto; las `existing` se bajan, editan y vuelven item `new` → el blob viejo queda huérfano, recuperable). El editor sale como WebP en Notas/Tareas y JPEG en Momentos (lo que pide el compresor de cada flujo). GIF no se edita (canvas aplana la animación).
- **Editor de PDF (sección `pdf` del mundo Notas).** Herramienta 100% client-side (nada se sube) para combinar **PDFs + imágenes** en un documento, a nivel de **página** (estilo iLovePDF): cada PDF se expande en sus páginas y cada imagen es una página; todas se ven como miniaturas reordenables (botones ◄ ► o arrastrando) y borrables, y se guardan como un PDF nuevo. El **modelo es puro y testeado** (`src/lib/pdfStudio/model.ts`: un `PdfDoc` = sources + páginas ordenadas; `addPdfSource`/`addImageSource`/`movePage`/`deletePage`/`replacePageWithImage` + las de selección múltiple `deletePages`/`rotatePages`/`duplicatePages`/`subsetDoc`, todas inmutables, descartan sources huérfanos). Los **bordes browser-only** van aparte y **excluidos del coverage**: `pdfRender.ts` (miniaturas con pdf.js — DOMMatrix/canvas/Worker), `assemble.ts` (ensamblado con pdf-lib: `copyPages` para PDF, `embedJpg` para imágenes; `ignoreEncryption` + saltea source cifrado/corrupto con aviso) y la UI `components/notas/pdfStudio/**`. `pdf-lib` (con `@pdf-lib/fontkit`) y `pdfjs-dist` (~1MB + worker) se cargan **PEREZOSO** (la sección es `React.lazy`; las libs por `await import()` → chunks `vendor-pdf-lib`/`pdf` aparte, el bundle `index` no se toca). La descarga reusa `downloadBlob` (compartido con `photoExport`). Se integra con `useModuleVisibility` (ocultable) y el comando `#pdf`. **Agregar texto es VECTORIAL** (`drawText` de pdf-lib, no se rasteriza): el editor (`PdfTextEditor.tsx`, **modal de "ver y editar"** que se abre con **doble clic** en la miniatura —o desde el menú `⋯`—, portaleado a `<body>`, con la barra de edición ARRIBA **compacta** (cabecera + tools en filas de baja altura → el documento ocupa ~86% del modal; **zoom por defecto 150%**) en **una sola fila** —cada stepper con su **ícono identificador** (tamaño/opacidad/rotación/zoom, para que no se confundan, vía un componente `Stepper`)— y **navegación entre TODAS las páginas** del documento sin cerrar (mantiene un mapa índice→anotaciones de las páginas editadas y al confirmar las commitea todas juntas)) muestra la página grande y deja agregar cajas de texto arrastrables con fuente/tamaño/negrita/color, **opacidad, rotación del texto** (pivote en la baseline, igual que pdf-lib) y **duplicar**. La **barra de estilo está SIEMPRE activa y funcional**: edita el texto seleccionado o, si no hay ninguno, define el estilo del próximo (duplicar/borrar son contextuales). El **contenido del texto se edita INLINE sobre el cuadro** (doble clic abre un `contentEditable` no controlado, enfocado; Enter o clic afuera confirman, Esc cancela), no en la barra. Un padding **transparente** alrededor del cuadro (compensado por margen negativo, sin mover el texto) agranda el área clickeable para que el clic simple seleccione siempre (arregla el "a veces no se selecciona"). La posición y el tamaño se guardan como **ratios** del tamaño de página en el modelo (`TextAnnotation`, `setPageAnnotations`, ops puras testeadas) → WYSIWYG (el preview usa la **misma fuente real**, `previewFontFamily`: Inter/Spectral, las que la app ya carga y que el ensamblado embebe) e independiente de la resolución. Al ensamblar, `assemble` **embebe la tipografía REAL de la app**: Inter (sans) y Spectral (serif), como **WOFF subset-latino vendorizados** (`pdfStudio/fonts/`, OFL, importados con `?url` → assets aparte que se bajan por `fetch` recién al guardar), embebidos con **subconjunto** vía `@pdf-lib/fontkit` (registrado sólo si hay texto embebible; WOFF v1 = `pako`). Si esa fuente no carga, cae a las **estándar base-14** (`standardFontName` → Helvetica/Times/Courier → render garantizado); mono siempre usa Courier. La baseline se baja `baselineDropEm` (función **pura/testeada**: modela el line-box CSS con las métricas reales de cada fuente → preview ≈ salida, verificado contra el render del navegador con Δ < 0.005·tamaño), convirtiendo `yRatio` (tope desde arriba) a la baseline desde abajo. El texto queda **seleccionable** y la página de PDF **intacta** (no se aplana). **Edición fiel:** **undo/redo** (`history.ts`, pila genérica pura/testeada de snapshots del `PdfDoc` inmutable; `⌘Z`/`⌘⇧Z`), **rotar páginas** (`rotatePage` puro + `setRotation` en el ensamblado; la miniatura se rota con un ajuste de escala para entrar en la caja 3:4), e **imágenes PNG sin pérdida** (`embedPng` con firma `‰PNG`; el resto se re-encodea a JPEG). La matemática de coordenadas del texto se extrajo a `textBoxLayout` (pura, testeada). En el editor de texto: `Supr` borra el texto seleccionado y las flechas lo mueven fino; el editor muestra la página en su orientación **final** (rotada) — WYSIWYG con la salida (el delta de arrastre se transforma por la rotación). `assemble.ts` tiene un **test de contrato** (`assemble.test.ts`, mockeando pdf-lib por el camino PNG, sin canvas) que blinda `embedPng` vs `embedJpg`, `setRotation`, el **embebido de fuente real (bytes + subconjunto) vs el fallback estándar** y las coordenadas de `drawText`. **Detalles:** las acciones por página (texto, **rotar a la derecha/izquierda**, **duplicar**, **imprimir**, eliminar) viven en un `OverflowMenu` (`⋯`) —reordenar (◄ ►) queda directo— para no apretar los toques en cards angostas; cada card es **enfocable y reordena con flechas** (teclado) y **seleccionable** (badge ✓ arriba-izq, Shift = rango, Esc deselecciona) para **acciones en lote** desde una barra contextual: rotar, duplicar, **extraer las seleccionadas a un PDF nuevo** (`subsetDoc` + `assemble`), **imprimir** y eliminar. **Imprimir** funciona a tres granularidades —una página (menú `⋯`), las seleccionadas (barra de lote) o todo el documento (barra superior)— ensamblando el subconjunto correspondiente y abriéndolo en un `<iframe>` **fuera de pantalla pero con tamaño real** (uno `0×0`/`visibility:hidden` NO pinta el PDF → `print()` saldría en blanco) para disparar `print()` del navegador (`printPdf.ts`, browser-only, excluido del coverage). Además: un PNG **enorme** (>15 MP, leído del IHDR con `readPngSize` sin decodificar) se downscalea por el camino JPEG en vez de embeberse sin pérdida. **Persistencia:** el documento de trabajo se **autoguarda en IndexedDB** (`persistence.ts`, debounced) bajo una clave **por usuario** (`getCurrentClientUserId() ?? 'anon'`) — los `File` se clonan nativo, así el trabajo sobrevive recargas/navegación; al volver se restaura (con `reseedIds` para que los ids nuevos no choquen con los restaurados) y "Nuevo" descarta el borrador.
- **Home** usa `/api/home` como lectura liviana. No vuelvas a cargar entities/quotes/relationships completos para pintar la portada.
- **Cronologia** es una vista derivada: al mutar entidades, citas, relaciones, Momentos, Notas, Tasks o X, invalida sus query keys además del dominio principal.
- **Atlas** y **Cronicas** generan propuestas IA; siempre deben pasar por `checkMonthlyBudget(userId, requestId)` y registrar `extraction_log`.
- **Notas, Tasks, Prompts y Claves** siguen las mismas reglas de `user_id`, soft-delete y transforms camelCase/snake_case que el CRUD core.
- **Anexos de Notas/Prompts** viven en Netlify Blobs vía endpoints backend (`notas-attachments-*`), nunca desde cliente. Cada upload/list/download valida `user_id` y dueño activo (`note` o `prompt` con `deleted_at IS NULL`). Son archivos privados autenticados, sin vault ni cifrado local; el cifrado fuerte del mundo Notas pertenece solo a Claves. Al borrar una nota o prompt, sus anexos se soft-deletean.
- **Note card minimalista** (`NoteCard`): la cara muestra SOLO el texto; las acciones (→momento, editar, fijar, anexos, borrar) viven tras un `OverflowMenu` de 3 puntos, "fijada" es un punto salvia (+ texto `sr-only`) y la fecha es una línea info del menú. Las fotos usan `AttachmentPhotos` en modo `compact` (solo el ícono que abre el visor/editor; sin tira/descarga/PDF); los archivos no-imagen siguen tras "Anexos" (`AttachmentsPanel`). El composer y el campo de edición usan `useAutosizeTextarea` (`src/hooks`), que crece con el contenido entre min/max filas (reset-then-measure sobre `scrollHeight`, re-mide en cambios de ancho con `ResizeObserver`).
- **Preferencias de UI (`user_prefs`)**: un JSONB por usuario (tabla `user_prefs`, endpoint `user-prefs` con **merge superficial** `jsonb ||`). `useUserPrefs` hidrata de un **espejo en localStorage marcado con el dueño** (`{owner, prefs}`) — en navegador compartido el usuario B NO ve el espejo de A (la lectura solo devuelve prefs si el owner = `getCurrentClientUserId()`; sin Clerk el id es null y matchea). Al cambiar de usuario, `WorldShell` descarta el espejo + `trama:world` y resetea el mundo. Hoy guarda: `visibleModules` (qué secciones del mundo Notas se ven — `useModuleVisibility`, **Inicio nunca ocultable**) y `defaultWorld` (mundo inicial en navegador fresco; el último usado gana si existe).
- **Revelar módulo por comando**: el buscador (de Notas y el ⌘K) abre/revela un módulo oculto si se tipea su alias con `#` (`moduleAliases`, `matchModuleAlias`; p. ej. `#pass` → Claves). Es **declutter, no seguridad** — cualquiera puede tiparlo; lo que protege a Claves es su vault.
- **Claves** es un vault cliente: el backend solo acepta `secret`, `service`, `username` y `notes` como sobre cifrado `{ v: 1, alg: "AES-GCM", iv, data }` o `null`. `label`, `kind`, flags y fechas siguen visibles para ordenar/filtrar; no los describas como E2EE. El valor secreto y la metadata sensible se descifran solo en cliente con contraseña/key física del vault.
- **Contrato de vault:** ver `docs/notas-vault.md` antes de tocar seguridad, copy o persistencia de Claves.
- **X** nunca expone tokens al cliente. Tokens, bookmarks y cronicas de X se filtran por `user_id`; cualquier sync o generación debe invalidar Home si cambia actividad visible.
- **Preview/search externos** (`momentos-url-preview`, `wikipedia-search`) requieren auth. Cualquier fetch server-side nuevo debe bloquear loopback, link-local y rangos privados antes de seguir redirects.
