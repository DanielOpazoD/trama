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

## Dominios derivados y operacionales

- **Home** usa `/api/home` como lectura liviana. No vuelvas a cargar entities/quotes/relationships completos para pintar la portada.
- **Cronologia** es una vista derivada: al mutar entidades, citas, relaciones, Momentos, Notas, Tasks o X, invalida sus query keys además del dominio principal.
- **Atlas** y **Cronicas** generan propuestas IA; siempre deben pasar por `checkMonthlyBudget(userId, requestId)` y registrar `extraction_log`.
- **Notas** y **Tasks** siguen las mismas reglas de `user_id`, soft-delete y transforms camelCase/snake_case que el CRUD core.
- **X** nunca expone tokens al cliente. Tokens, bookmarks y cronicas de X se filtran por `user_id`; cualquier sync o generación debe invalidar Home si cambia actividad visible.
- **Preview/search externos** (`momentos-url-preview`, `wikipedia-search`) requieren auth. Cualquier fetch server-side nuevo debe bloquear loopback, link-local y rangos privados antes de seguir redirects.
