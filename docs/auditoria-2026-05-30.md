# Auditoría exhaustiva de Trama — 2026-05-30

## Resumen ejecutivo

Trama está en estado sólido pero con grietas concretas que conviene cerrar antes de abrir multi-user a la familia. La arquitectura LLM, la disciplina TypeScript (cero `any`, cero `@ts-ignore`), el CI con 5 jobs paralelos y el sistema de diseño son fortalezas reales. El problema mayor es la migración multi-user a medio cerrar: hay un agujero P0 de aislamiento en chat (`chat-messages.mts` y `ask.mts` leen/escriben sin filtrar `user_id`), el `cost-cap` mensual es bypaseable desde `atlas.mts` y `cronicas.mts`, y el `shouldReembed` violando CLAUDE.md cuesta dinero a OpenAI en cada PATCH.

**Nota global: 4/7** (ponderada). El piso lo marcan APIs (4) y LLM/observabilidad (4) por el agujero de chat y los bypasses al cap; testing (6) y CI/ops (5) sostienen, pero no pueden compensar una vulnerabilidad multi-user activa. La regla obligatoria "si una dimensión crítica está en 3 o menos la global no puede ser >4" no aplica acá, pero APIs y LLM en 4 con P0 abierto tampoco habilitan subir.

**3 fortalezas reales:**

- Subsistema `_lib/llm/` bien aislado: cero `fetch` rogue a APIs LLM (salvo embeddings), fallback chain robusto, cache de dos niveles.
- Disciplina de tipos y tests: 100 archivos de test, thresholds calibrados, cero `any`/`@ts-ignore`, gate de migraciones idempotente en CI.
- Sistema de diseño con vocabulario propio (`.card-paper*`, `EmptyMessage`, `ViewHeader`, `useTimeOfDayAccent`) usado consistentemente.

**3 riesgos mayores:**

- P0: cross-user read/write de chat threads y mensajes (`chat-messages.mts:45-51,84-86`, `ask.mts:71-78`).
- P0/P1: `cost-cap` mensual bypaseable (`atlas.mts:222`, `cronicas.mts:214` sin `checkMonthlyBudget` ni `extraction_log`) + default 500 vs 5000 documentado.
- P0/P1: regla "no re-embedear sin cambio real" violada en `entities.mts:253` y `quotes.mts:223` — gasto recurrente a OpenAI.

**Si solo pudieras hacer una cosa esta semana:** cerrar el aislamiento de chat (`AND user_id = ${userId}` en todas las queries de `chat_messages`/`chat_threads`) y endurecer `isolation-guardrail.test.ts` a nivel sentencia (AST de cada SQL template). Es un fix chico que cierra el único P0 de seguridad activo.

## Scorecard

| #          | Dimensión                    | Nota /7 | Justificación (1 línea)                                                                                                            | Evidencia principal                                                              |
| ---------- | ---------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1          | Mapa del sistema             | 5/7     | Invariantes respetados en código, pero `ARCHITECTURE.md` describe stack obsoleto (SVG casero vs Sigma actual).                     | `ARCHITECTURE.md:25-26,200` vs `src/components/graph/GraphCanvasSigma.tsx`       |
| 2          | Arquitectura y modularidad   | 6/7     | LLM bien splitteado, cero rogue fetches, gaps menores (un `Response` crudo, sqlTyped a medias, embeddings fuera de `_lib/llm/`).   | `_lib/llm/dispatch.ts:88-115` + `_lib/llm/index.ts:18-32`                        |
| 3          | Modelo de datos              | 5/7     | Soft-delete y origin JSONB sólidos, pero FKs `user_id→users(id)` faltan en notes/tasks/cronicas/atlas/x\_\*.                       | `20260528150000_atlas/migration.sql:21` y siguientes                             |
| 4          | APIs y contratos             | 4/7     | P0 cross-user en chat + P1 owner-check parcial en quotes/relationships/momentos POST.                                              | `chat-messages.mts:45-51,84-86`                                                  |
| 5          | LLM, costos y observabilidad | 4/7     | Cap bypaseable en atlas/cronicas + re-embed sin verificar cambio real en entities/quotes (viola CLAUDE.md).                        | `entities.mts:253-258` + `atlas.mts:222` + `cronicas.mts:214`                    |
| 6          | Seguridad                    | 5/7     | CSP/HSTS/Clerk sólidos, pero SSRF parcial sin mitigar en url-preview (IPs privadas no bloqueadas).                                 | `momentos-url-preview.mts:65-95`                                                 |
| 7          | Performance y escala         | 5/7     | Lazy routes + WebGL switch + virtualización, pero `graph-neighbors` con subquery sin `user_id` y HomeView wholesale.               | `GraphSvgCanvas.tsx:184-189` + `graph-neighbors.mts:102-111` + `HomeView.tsx:50` |
| 8          | Frontend, UX y diseño        | 5/7     | Sistema rico y coherente, pero ~434 tokens legacy + ~30 colores Tailwind genéricos fuera de `.alert-*` + `outline-none` en inputs. | `Sidebar.tsx:262-265,379-382`                                                    |
| 9          | Estado del cliente           | 5/7     | 35 hooks, optimistic+rollback parejo en core, pero bug de debounce en posiciones + falta invalidación cross-domain.                | `src/state/useEntities.ts:166-191`                                               |
| 10         | Testing y calidad            | 6/7     | 100 tests, 5 jobs en CI, thresholds calibrados; gaps en endpoints AI críticos (ask/atlas/search/suggest-rels).                     | `.github/workflows/test.yml` + `vitest.config.ts:60-65`                          |
| 11         | CI/CD y operaciones          | 5/7     | CI armado, gate de migraciones, gitleaks; pero `.env.example` con var retirada y `docs/deploy.md` stale.                           | `.env.example:4` vs `_lib/db.ts:5` + CLAUDE.md:28                                |
| 12         | Documentación y onboarding   | 4/7     | Reglas duras condensadas, pero drift severo (7 dominios sin docs, conteos off, `ARCHITECTURE.md` miente sobre el grafo).           | `.env.example:5` vs CLAUDE.md:28                                                 |
| 13         | Deuda técnica priorizada     | 5/7     | Deuda bien catalogada, pero migración multi-user con callejones abiertos (provisioning, fallback, tests de aislamiento).           | `_lib/auth.ts:60-99` + `roadmap.md:6`                                            |
| 14         | Top oportunidades            | 5/7     | Quick-wins claros (embeddings, sqlTyped, vistas monolíticas, Icons.tsx).                                                           | `_lib/embeddings.ts:113` + `GraphView.tsx` + `Icons.tsx`                         |
| **GLOBAL** | **(ponderada)**              | **4/7** | **Piso marcado por APIs y LLM/obs con P0 multi-user abierto; el resto sólido pero no compensa.**                                   | **—**                                                                            |

## Reglas violadas

- **CLAUDE.md "Errores de endpoints con `ApiErrors.*` (no `new Response('texto', {status:4xx})`)"** → `_lib/ai-mode.ts:106` devuelve `Response` crudo con 423. (Dim. 2)
- **CLAUDE.md "Re-embedear en PATCH sin verificar que cambió el texto"** → `entities.mts:253-258` y `quotes.mts:223-227` usan `body.field !== undefined` en vez de comparar pre/post. (Dim. 5)
- **CLAUDE.md "No llamar fetch directo a una API de LLM"** → `_lib/embeddings.ts:113` hace `fetch(OPENAI_EMBED_URL, ...)` fuera de `_lib/llm/providers/`. (Dim. 2 y 14, caso límite: embeddings ≠ chat pero espíritu aplica)
- **CLAUDE.md "Variable correcta ahora es NETLIFY_DB_URL"** → `.env.example:4-5` declara `NETLIFY_DATABASE_URL`, var retirada. (Dim. 11, 12)
- **CLAUDE.md "EntityType / RelationshipType: la fuente de verdad son las tablas entity_types y relationship_types"** → esquema no enforce FK; `entities.type` y `relationships.type` son `TEXT` sin `REFERENCES`. (Dim. 3)
- **CLAUDE.md "Cascadea soft-delete a sus relaciones y citas"** → `entities.mts:289-299` no cascadea a `momento_entities` ni a `notes`. (Dim. 13)
- **CLAUDE.md "Errores con ApiErrors.\* (shape canónico)"** → `entities.mts:182-194` devuelve `{error:'possible_duplicate',suggestions}` ad-hoc en 409. (Dim. 4 y 13, documentada como excepción pero rompe la regla)
- **docs/conventions/api.md "Schemas Zod en POST/PATCH"** → `suggest-relationships.mts:48` usa `req.json().catch(()=>({})) ` sin Zod. (Dim. 4)
- **filosofia-estetica.md sección 2.1 "Cero paleta arcoíris fuera de .alert-error/.alert-warn"** → `Sidebar.tsx:234,262-266,302,379-382`, `TopBar.tsx:181-196`, `ToastHost.tsx:54-56`, `ReclassifyPanel.tsx:152,158`, `FotoEditModal.tsx:434` usan `bg-red-*`/`bg-amber-*`/`bg-sky-*`/`text-emerald-*` directos. (Dim. 8)
- **design.md regla 8 "No `outline-none` salvo reemplazo equivalente"** → `TwitterView.tsx:324`, `CommandPalette.tsx:192`, `ChatView.tsx:362`, `notas/{NotasView,TareasView,NoteCard}.tsx`. (Dim. 8)
- **filosofia-estetica.md sección 4 regla 1 "No arbitrary values"** → `notas/markdown.tsx:35,241`, `notas/ActivityCalendar.tsx:184` sin justificación inline. (Dim. 8)
- **design.md "Icon sizes: 5 valores (10/12/14/18/22)"** → `size={16}/{20}/{26}` en TopBar, MobileBottomNav, GabineteView, WorldSwitcher, ViewRouter, PhotoLightbox, HojaEditor. (Dim. 8)
- **Migración 20260526000000_multi_user_schema (invariante implícita)** → `graph-neighbors.mts:102-111` calcula degree sin filtrar `user_id`. (Dim. 7)
- **docs/deploy.md:78 "netlify.toml no existe"** → contradice la realidad (existe con 49 líneas y CSP). (Dim. 11)

## Dimensiones

### 1. Mapa del sistema

**Nota: 5/7** — invariantes respetados en código pero `ARCHITECTURE.md` describe stack obsoleto.

**Hallazgos:**

- `ARCHITECTURE.md:25-26,200,281` describe "SVG casero / force-directed Fruchterman-Reingold ~120 líneas" como decisión vigente, pero ya se migró a Sigma (`package.json:47,52`).
- `ARCHITECTURE.md` no menciona Momentos, Atlas, Crónicas, Notes, Tasks, X/bookmarks (todos presentes en `netlify/functions/`).
- `ARCHITECTURE.md:273` sigue diciendo "site password" cuando hay Clerk; no menciona la migración multi-user.
- `docs/arquitectura.md:35` dice "44 endpoints" pero hay 65 (`ls netlify/functions/*.mts | wc -l`).
- Reglas duras de CLAUDE.md respetadas en código: cero `neon(`/`NETLIFY_DATABASE_URL` directo, cero fetch rogue a LLM fuera de `_lib/llm/`, cero `@netlify/blobs` desde `src/`.
- Frontera snake↔camel centralizada en `src/api/transform.ts` y consumida correctamente.

**Riesgos:**

- Devs/agentes nuevos guiados por `ARCHITECTURE.md` toman decisiones contra un stack inexistente.
- Subsistemas Momentos/Atlas/X bookmarks son zonas ciegas para revisión arquitectónica.
- CSP en `netlify.toml:43` con hosts hardcoded; añadir nuevo provider sin actualizar rompe sin que el mapa lo indique.

**Recomendaciones:**

- Reescribir `ARCHITECTURE.md` o apuntarlo a `docs/arquitectura.md` actualizado.
- Actualizar el contador "44 endpoints" a 65 o dinamizarlo.
- Diagramas para Momentos, Atlas, X bookmarks.
- Check de CI que warne si docs declaran número fijo y la realidad no coincide.

**Qué subiría la nota:** reconciliar `ARCHITECTURE.md` con la realidad y agregar diagramas para los 3-4 flujos no documentados → 6.

### 2. Arquitectura y modularidad

**Nota: 6/7** — LLM bien splitteado, gaps menores.

**Hallazgos:**

- `_lib/llm/` con 1342 LOC bien dividido (types/config/cache/retry/dispatch/providers).
- Cero fetches rogue: grep `fetch.*api\.(openai|anthropic|google|deepseek)` fuera de `_lib/llm/` vacío.
- Único caso "extra": `_lib/embeddings.ts:113` (OpenAI embeddings) — API distinta, aceptable pero rompe la regla sin nota explícita.
- Cero `neon()` directo en todo el repo; `getSql()` canónico en `db.ts:12-20`.
- `withObservability` adoptado en 124 referencias sobre 65 functions.
- Subpackages `_lib/x/` y `_lib/spotify/` bien encapsulados con barrels.
- **VIOLACIÓN**: `_lib/ai-mode.ts:106` devuelve `new Response('IA deshabilitada…', {status:423})` en vez de `ApiErrors.*`.
- `sqlTyped<Row>()` a medio adoptar: 151 usos vs 37 casts viejos `as Array<…>` en `.mts`.

**Riesgos:**

- Precedente de embeddings fuera de `_lib/llm/` puede replicarse.
- Casts viejos coexistiendo con `sqlTyped` rompen refactors silenciosamente.
- `aiOffResponse()` rompe contrato de error.

**Recomendaciones:**

- Migrar `_lib/ai-mode.ts:106` a `ApiErrors.*` con código `AI_DISABLED`.
- Terminar migración a `sqlTyped<Row>()`.
- Documentar o mover embeddings dentro de `_lib/llm/`.

**Qué subiría la nota:** cerrar los 3 gaps → 7.

### 3. Modelo de datos

**Nota: 5/7** — soft-delete y origin sólidos, FKs multi-user faltantes.

**Hallazgos:**

- `atlas_snapshots.user_id` (`20260528150000_atlas:21`), `cronicas.user_id` (`20260528130000_cronicas:18`), `notes`/`tasks`/`x_*` declaran `user_id` SIN `REFERENCES users(id)`, rompiendo convención de `20260526000000_multi_user_schema`.
- `entities.type` y `relationships.type` son `TEXT` sin FK a `entity_types`/`relationship_types`.
- `linked_quote_ids` (`20260521030000_quotes_reflections:20`), `cronicas.source_entity_ids` y `atlas_snapshots.clusters.memberIds` son referencias soft sin FK ni trigger de limpieza.
- `notes.promoted_momento_id` (`20260529000000_notes:20`) es `uuid` sin `REFERENCES momentos(id)`.
- `momentos.embedding` tiene índice HNSW pero falta índice equivalente sobre `momentos.user_id`.
- Tres convenciones distintas para "uno por usuario" (PK simple, PK compuesta, UNIQUE).
- `extraction_log.user_id` y `error_log.user_id` siguen nullable tras el backfill.

**Riesgos:**

- Al activar Clerk y eliminar usuarios, las tablas sin FK quedan huérfanas.
- `linked_quote_ids`/`source_entity_ids` pueden apuntar a entidades soft-deleted.
- Borrar un `entity_type` puede dejar entidades con type huérfano.
- Logs con `user_id` nullable = agujero de privacidad/atribución.

**Recomendaciones:**

- Migración: `ALTER TABLE notes/tasks/cronicas/atlas/x_*` agregando FK `user_id → users(id)`.
- FK opcional (`NOT VALID + VALIDATE`) `entities.type → entity_types.slug`.
- Backfill + `NOT NULL` en `extraction_log.user_id` y `error_log.user_id`.
- Índices GIN sobre `linked_quote_ids` y `source_entity_ids`.

**Qué subiría la nota:** cerrar FKs faltantes → 6. Para 7: limpiar referencias soft con patrón consistente.

### 4. APIs y contratos

**Nota: 4/7** — P0 cross-user en chat + P1 owner-check parcial.

**Hallazgos:**

- **P0**: `chat-messages.mts:45-51,84-86,101-105,120-126,213-223` filtran solo por `thread_id`, sin `user_id`. Cross-user read/write si se conoce el UUID del thread. `ask.mts:71-78` mismo problema.
- `quotes.mts:137` SELECT `entities WHERE id = ${body.entity_id}` sin `user_id` (permite crear cita atada a entidad de otro user).
- `relationships.mts:117-126` POST sin validar que `from_id`/`to_id` pertenezcan al `userId`.
- `momentos.mts:242-249` INSERT en `momento_entities` sin validar ownership.
- `entities.mts:182-194` devuelve 409 con shape legacy `{error:'possible_duplicate',suggestions:[...]}` fuera del contrato canónico.
- `momentos-url-preview.mts:50-67` y `wikipedia-search.mts:13` sin auth.
- `suggest-relationships.mts:48` usa `req.json().catch(()=>({}))` sin Zod.
- Inconsistencia DELETE: 200 con `{deletedAt}` vs 204 vacío.
- Infra de contratos buena: `ApiErrors`, `parseJsonBody`, `withObservability` con `requestId`, errores parciales en import.

**Riesgos:**

- Multi-user leakage P0 de chat (conversaciones + propuestas IA ajenas).
- Pollution cross-user de relaciones/citas/momentos con UUIDs huérfanos a largo plazo.
- SSRF leve en `momentos-url-preview`.
- `isolation-guardrail.test.ts` regex per-archivo da falsa seguridad.

**Recomendaciones:**

- `AND user_id = ${userId}` en TODAS las queries de chat y ask.
- Endurecer guardrail a nivel sentencia (AST de cada SQL template).
- Pre-verificar ownership de `entity_id`/`from_id`/`to_id` antes de INSERT en quotes/relationships/momentos.
- Migrar 409 de entities al shape canónico.
- Auth en `momentos-url-preview` y `wikipedia-search`.

**Qué subiría la nota:** cerrar chat-messages + endurecer guardrail → 5. Ownership en POST → 6. Excepción 409 + auth completa → 7.

### 5. LLM, costos y observabilidad

**Nota: 4/7** — cap bypaseable + re-embed sin verificación.

**Hallazgos:**

- **Re-embed sin chequear**: `entities.mts:253` calcula `embeddingDirty = body.name !== undefined || …` — viola regla CLAUDE.md. Idem `quotes.mts:223`, `momentos.mts:305`.
- **Bypass del cap**: `atlas.mts:222` y `cronicas.mts:214` llaman `askLLMForJson`/`askLLMForText` sin `checkMonthlyBudget` ni `INSERT INTO extraction_log`.
- Defaults inconsistentes: `cost-cap.ts:36` y `cost-alert-check.mts:34` usan 500 cents; docs dicen 5000 (factor 10×).
- `docs/ai.md:92` dice "503" cuando `cost-cap.ts:88` devuelve 429.
- Fallback cross-provider bien cableado, limitado a transients (`dispatch.ts:155-184`).
- Cache de dos niveles (memoria + Postgres) con TTL.
- `embed()` no usa `fetchWithRetry`, no loguea en `extraction_log`.
- Fail-open intencional si `safeSql()` devuelve null — no monitoreado.

**Riesgos:**

- Cada PATCH paga embedding a OpenAI evitablemente.
- Atlas/cronicas pueden inflar gasto IA sin disparar cap ni alerta.
- Si Netlify pierde `AI_MONTHLY_BUDGET_CENTS`, cap real cae a $5/mes.
- Ventana de gasto sin tope cuando Neon falla transitoriamente.

**Recomendaciones:**

- `shouldReembed` real: leer row pre-PATCH y comparar contra body.
- `checkMonthlyBudget` + `INSERT INTO extraction_log` en atlas y cronicas.
- Alinear defaults (5000 en código y doc).
- Envolver `embed()` con `fetchWithRetry`.

**Qué subiría la nota:** los cuatro fixes → 6.

### 6. Seguridad

**Nota: 5/7** — hardening sólido, SSRF parcial no mitigado.

**Hallazgos:**

- CSP completo y restrictivo (`netlify.toml:43`), HSTS preload, XFO DENY, Permissions-Policy.
- Auth Clerk con tabla de decisión clara (`_lib/auth.ts:60-99`).
- Cero `@netlify/blobs` desde cliente; cero `sql.unsafe`.
- 1 solo `dangerouslySetInnerHTML` (`MomentoQRModal.tsx:158`) con threat model documentado.
- Markdown renderer limita href a http(s).
- **SSRF parcial**: `momentos-url-preview.mts:50-67` chequea protocolo pero NO filtra IPs privadas (127.0.0.1, 169.254.169.254 metadata, RFC1918, ::1).
- Prompt injection sin defensas: `extract-prompt.ts:53` inyecta userText crudo; `chat-prompt.ts:166-171` mete contenido controlable por user.
- `rag-context.ts:130-163` concatena descriptions de entidades importadas (indirect prompt injection desde X bookmarks/momentos).
- Tests `isolation*.test.ts` cubren entidades, momentos, quotes, relationships.
- `momentos-file.mts:48` deja keys legacy sin auth (en migración).
- `SECURITY.md` presente con gitleaks + allowlist.
- CSP sin `report-uri/report-to`.

**Riesgos:**

- SSRF a metadata AWS/GCP (169.254.169.254) o servicios internos vía url-preview.
- Prompt injection indirecto: cita o descripción puede empujar al modelo a proponer destructivos.
- `ALLOW_LEGACY_FALLBACK=true` accidental en prod = auth bypass.
- Keys legacy de blobs sin auth.

**Recomendaciones:**

- Resolver hostname con `dns.lookup` y rechazar IPs privadas en url-preview.
- Health check que falle deploy si `ALLOW_LEGACY_FALLBACK=true` en prod.
- Wrapper anti-prompt-injection con delimitadores únicos.
- Sunset de legacy blob keys.
- CSP `report-to`.

**Qué subiría la nota:** SSRF mitigado + delimitadores anti-injection → 6. Report-uri + sunset legacy keys + test SSRF → 7.

### 7. Performance y escala

**Nota: 5/7** — buenas defensas, deudas claras.

**Hallazgos:**

- Code-splitting con `React.lazy` en todas las vistas; `GraphCanvasSigma` lazy-import solo cuando entities ≥ 1000.
- Bundle budgets en CI (`scripts/check-bundle-size.mjs:22-31`).
- Listas grandes virtualizadas con `@tanstack/react-virtual`.
- `GraphNode` y `GraphEdge` memoizados con comparator custom.
- **`GraphSvgCanvas:184-189`**: `isDimmed` con `relationships.some()` dentro del `entities.map` — O(N×R) por render. 900 × 4000 ≈ 3.6M iteraciones.
- `GraphCanvasSigma` reconstruye solo cuando cambian counts.
- **`graph-neighbors.mts:102-111`**: doble correlated subquery `COUNT(*) FROM relationships` SIN `user_id`. Costoso a 10k rels + leak de degree cross-user.
- `HomeView.tsx:50-51` hace 3 wholesale queries; `useQuotesQuery` llama `listQuotes()` full-table para featured.
- `RelationshipsView.tsx:35` usa `useEntitiesQuery()` wholesale para resolver nombres.
- RAG con token-budget (`DEFAULT_CONTEXT_TOKEN_BUDGET=6000`).
- Streaming SSE real en `chat-messages.mts:160-292`.

**Riesgos:**

- Mezcla cross-user del degree en graph-neighbors + costo de subquery doble.
- HomeView descarga toda la trama en cada abrir.
- SVG entre 500-999 nodos sufre con isDimmed.
- Drift de bundle silencioso en chunks lazy sin budget.

**Recomendaciones:**

- Fix `graph-neighbors`: `user_id` al `COUNT(*)` y CTE en vez de correlated subquery.
- Endpoint `/api/home` con shape liviano (featured server-side + counts).
- Memoizar `isDimmed` con `Set<string>` de vecinos del nodo seleccionado.
- `from_name`/`to_name` en `/api/relationships` paginado.
- Budgets para chunks lazy.

**Qué subiría la nota:** fix neighbors + memoize isDimmed + featured server-side → 6. RelationshipsView no-wholesale + budgets → 7.

### 8. Frontend, UX y diseño

**Nota: 5/7** — sistema rico, desvíos verificables.

**Hallazgos:**

- ~434 usos de tokens legacy `text-xs/sm/2xl` en lugar de semánticos.
- ~30 colores Tailwind genéricos (`red`/`amber`/`emerald`/`sky`) fuera de `.alert-*`: `Sidebar.tsx:234,262-266,302,379-382`, `TopBar.tsx:181-196`, `ToastHost.tsx:54-56`, `ReclassifyPanel.tsx:152,158`, `FotoEditModal.tsx:434`.
- 13 arbitrary values `text-[Npx]`; algunos sin justificación inline.
- `outline-none` sin reemplazo en inputs: `TwitterView.tsx:324`, `CommandPalette.tsx:192`, `ChatView.tsx:362`, `notas/{NotasView,TareasView,NoteCard}.tsx`.
- Icon sizes fuera de la escala 10/12/14/18/22: `size={16}/{20}/{26}` en varios componentes.
- `tracking-wider` (Tailwind default) usado donde corresponde `tracking-eyebrow`.
- `EmptyState.tsx` (empty state global del grafo) usa tokens legacy — debería ser ejemplar.
- `Sidebar.tsx:284` usa `bg-ink-900/30` que no existe en `tailwind.config.js` (escala llega a `ink-800`).
- Ningún `.touch-target` en `src/components/`; `Sidebar.tsx:311` p-1 sobre icon 14 → ~22px clickable.
- 239 `aria-*`, 15 `role=alert/status`; `ViewHeader` consistente.
- Patrones que SÍ siguen el sistema: `Greeting.tsx`, `EmptyMessage.tsx`, `MessageBubble.tsx`, card variants.

**Riesgos:**

- Chips con `bg-red-100`/`bg-amber-100` no responden a temas día/noche/vela.
- `outline-none` rompe focus visible (WCAG 2.4.7).
- Touch targets <44px en mobile.
- Drift gradual del type scale.

**Recomendaciones:**

- Componente reutilizable para chips de severity con CSS vars semánticas.
- Utility `.input-paper` con focus ring.
- Codemod incremental por vista para type scale legacy → semántico.
- `.touch-target` (min-w-11 min-h-11) en icon buttons mobile.

**Qué subiría la nota:** eliminar colores genéricos consolidando en `.alert-*` o chips con data-tone → 6. Type scale migrado + outline-none fix + touch targets → 7.

### 9. Estado del cliente

**Nota: 5/7** — bien estructurado con bugs puntuales.

**Hallazgos:**

- 35 archivos en `src/state/`. 12 componentes fuera usan `@tanstack/react-query` directo (settings panels y vistas hyper-locales).
- Optimistic+rollback bien en entidades/citas/relaciones/tasks-update.
- Sin rollback en `useMomentos.ts:31-77`, `useNotes.ts:20-48`, `useTasks.create/delete`.
- **Bug debounce**: `useEntities.ts:166-191` `let debounceTimer = null` en cuerpo del hook se reinicia en cada render. Drag rápido = spam de POSTs.
- Race condition latente en updates concurrentes sin `mutationKey`/scope.
- **Invalidación cross-domain incompleta**: useAddEntity/Quote/Momento no tocan `['cronologia','infinite']` ni `['atlas']`.
- Modo offline sin flujo de reconciliación al recuperar conexión.
- Streaming chat (`useChat.ts`): refs únicos por instance; sin guard contra sends concurrentes.
- `useGlobalStatus.ts:50-53` distingue silent vs persist via `meta.silent` — patrón limpio.
- `queryKeys` solo cataloga 9 keys; 15+ viven embebidas en hooks.

**Riesgos:**

- Posiciones del grafo: spam de POSTs a `/api/entity-position`.
- Rollback en cadena por mutations concurrentes.
- Drift offline → online silente.
- Atlas/cronicas muestran data vieja tras mutations en entidades/citas.
- Chat: dos sends concurrentes pisan refs.

**Recomendaciones:**

- `useRef` en debounceTimer (fix de 3 líneas).
- Centralizar TODAS las queryKeys con tipado.
- Invalidate cross-domain (`cronologia`, `atlas`) en mutations relevantes.
- Rollback en useMomentos/useNotes.
- `mutationKey` con id afectado.
- Guard contra sends concurrentes en useSendChatMessage.

**Qué subiría la nota:** fix debounce + queryKeys centralizadas + rollback en Momentos/Notas + plan offline → 6.

### 10. Testing y calidad

**Nota: 6/7** — suite muy sólida.

**Hallazgos:**

- 100 test files: 50 src + 50 `netlify/functions/_lib/`.
- 23 de 65 handlers tienen test extraído (~35%).
- Endpoints AI sin test extraído: `ask.mts`, `atlas.mts`, `search.mts`, `suggest-relationships.mts`, `proactive-suggestions.mts`, `extract-from-image.mts`, `reclassify-entities.mts`, `reindex-embeddings.mts`, `cronicas.mts`.
- `extract.mts` (más caro) SÍ tiene cobertura.
- LLM dispatch cubierto.
- Tests usan mocks de fetch — no hay integración real contra Postgres aunque CI levanta pgvector efímero (solo para SQL apply + idempotencia).
- E2E (Playwright): 7 specs con `/api/*` 100% mockeados.
- CI: 5 jobs paralelos (lint, unit, e2e, secrets, migrations).
- Coverage thresholds calibrados al baseline (39/55/71/39).
- Cero `@ts-ignore`/`@ts-expect-error` en código.
- Cero `: any`/`as any` en producción.
- 12 `eslint-disable` todos `react-hooks/exhaustive-deps` con justificación inline.

**Riesgos:**

- Mocks-only: SQL bugs no se detectan.
- ask/search sin tests de handler son críticos del RAG.
- Multi-user reciente: aislamiento cubierto en `_lib` pero no por endpoint.
- E2E nunca toca DB real.

**Recomendaciones:**

- Extraer ask/atlas/search/suggest-relationships a `*-endpoint.ts`.
- Tests de integración contra el Postgres efímero del job migrations.
- Tests por endpoint de aislamiento `user_id`.
- Documentar criterio extract-endpoint.
- Trinquete de coverage tras cada PR.

**Qué subiría la nota:** cubrir los 4 endpoints AI + integración SQL real + aislamiento por endpoint → 7.

### 11. CI/CD y operaciones

**Nota: 5/7** — sólido para single-dev, drift en docs.

**Hallazgos:**

- 5 jobs paralelos bien armados.
- Job migrations corre `scripts/apply-migrations.sh` sobre Postgres limpio + verifica idempotencia.
- Hook pre-commit con gitleaks (fallback graceful).
- `scripts/check-bundle-size.mjs` con budgets que fallan CI.
- `docs/deploy.md:78` dice "netlify.toml no existe" pero SÍ existe con 49 líneas y CSP.
- `docs/deploy.md:22` omite e2e/secrets/migrations/bundle-size del CI real.
- `.env.example:4` usa `NETLIFY_DATABASE_URL` (retirada).
- `.env.example` sin Clerk ni `ALLOW_LEGACY_FALLBACK`.
- Sin smoke test post-deploy automatizado.
- Crons inline en .mts sin runbook centralizado.
- `scripts/apply-migrations.sh` usa tabla `_migrations` propia ≠ `_netlify_database_migrations` que usa Netlify.
- URL Netlify inconsistente entre docs (`sites/trama` vs `projects/tramadaod`).

**Riesgos:**

- Migración mal aplicada requiere intervención manual en Neon Console.
- Setup de dev fresh va a fallar.
- `docs/deploy.md` desactualizado bajo incidente.
- CI testea un runner distinto al que usa Netlify.
- Sin smoke test = bug runtime llega a usuarios.

**Recomendaciones:**

- Sincronizar `docs/deploy.md` con la realidad.
- Renombrar `NETLIFY_DATABASE_URL` → `NETLIFY_DB_URL` en `.env.example` + Clerk.
- Smoke test post-deploy (GitHub Action o cron).
- Alinear runner de migraciones CI con Netlify o documentar la divergencia.
- Inventariar las 3 scheduled functions en docs.

**Qué subiría la nota:** sincronizar deploy.md + .env.example + inventario crons → 6. Smoke post-deploy + alineación runner + rollback documentado → 7.

### 12. Documentación y onboarding

**Nota: 4/7** — drift severo.

**Hallazgos:**

- `.env.example:5` declara var retirada `NETLIFY_DATABASE_URL`.
- `README.md:144` y `docs/arquitectura.md:35` dicen "44 endpoints" pero hay 65.
- `ARCHITECTURE.md:25` declara "SVG con cuatro modos … A migrar a sigma.js" pero Sigma ya está activo.
- `docs/arquitectura.md:22` dice "8 vistas" pero hay 11 en `ViewRouter`.
- Cero menciones en docs de AtlasView, CronologiaView, GabineteView, TwitterView, Espejo, Folio, Sortes, EntitiesWorkbench, ni hooks `useAtlas/useCronicas/useCronologia/useNotes/useTasks/useTwitter`, ni 6 migraciones recientes.
- `docs/README.md:15` dice "Hoy es single-user por diseño" contradiciendo `README.md:264-282` y `roadmap.md:6`.
- `README.md:253` documenta `npm run test:e2e` pero el script real es `e2e`.
- `AGENTS.md` es duplicado bit-a-bit de `CLAUDE.md`.
- `docs/conventions/llm.md` lista 3 funciones de 5 exportadas (falta `askLLMForVision`, `clearLLMCache`).
- `docs/conventions/data.md` lista hooks incompletos.
- `docs/observability.md` (112 LOC) no aparece en el índice de CLAUDE.md ni docs/README.md (huérfana).

**Riesgos:**

- Onboarding roto: copiar `.env.example` no funciona.
- Dominios sin doc se duplicarán o violarán convenciones.
- Drift entre `CLAUDE.md` y `AGENTS.md` inevitable.
- Conteos hardcoded enmascaran drift real.

**Recomendaciones:**

- Sincronizar `.env.example` (renombrar var + agregar Clerk).
- Reemplazar `AGENTS.md` por stub o symlink a `CLAUDE.md`.
- Eliminar conteos hardcoded o derivarlos.
- Secciones en `docs/conventions/dominios.md` para los 7 dominios nuevos.
- Reescribir bloque "Grafo" de `ARCHITECTURE.md`.
- Listar `docs/observability.md` en el índice.

**Qué subiría la nota:** .env.example + conteos + observability linkada → 5. Documentar 7 dominios nuevos + colapsar AGENTS → 6.

### 13. Deuda técnica priorizada

**Nota: 5/7** — bien catalogada, callejones multi-user abiertos.

**Hallazgos:**

- `legacy-single-user` aparece 50 veces en netlify/functions/ y src/.
- `ALLOW_LEGACY_FALLBACK=true` deja pasar requests sin token como dueño (`_lib/auth.ts:60-99`).
- Provisioning ausente: no hay webhook ni upsert lazy al primer login.
- Spotify aún single-user (`_lib/spotify/auth.ts:4-7`).
- Tests de aislamiento por user_id débiles (solo `_lib/auth.test.ts:127`).
- `src/api/request.ts:181-188` lee `window.__clerk` (acoplamiento global frágil).
- `entities.mts:289-299` DELETE no cascadea a momentos/notas.
- Streaming nativo no implementado en Anthropic/Gemini.
- UI de gestión de tipos ausente.
- Hard-cap silencioso de 5000 entidades en `entities.mts:51-67`.
- Componentes grandes: `Icons.tsx:569`, `GraphView.tsx:523`, `TwitterView.tsx:522`, `MomentosView.tsx:405`.
- 12 `eslint-disable` exhaustive-deps.
- Compat legacy de momentos (`storageKey` singular vs `items[]`).

**Riesgos:**

- Apertura multi-user real bloqueada sin provisioning + flip del fallback.
- Data huérfana al borrar entidades.
- Acoplamiento `window.__clerk` se rompe con upgrade de Clerk.
- Sin tests de aislamiento, un PR que olvide `AND user_id = ${userId}` pasa a prod.

**Recomendaciones:**

- Sprint corto multi-user: provisioning + flip + suite tests aislamiento.
- Cascade soft-delete a notas/tasks/momentos.
- Migrar a `useApiClient()` con `useAuth()` de Clerk.
- Reemplazar hard-cap por paginación real.
- Migrar 409 duplicados a shape canónico.

**Qué subiría la nota:** provisioning + flip fallback + tests aislamiento → 6. Vaciar TODOs históricos del roadmap → 7.

### 14. Top oportunidades

**Nota: 5/7** — quick-wins claros.

**Hallazgos:**

- Vistas-shell monolíticas: GraphView 523, TwitterView 522, MomentosView 405, ChatView 377, RelationshipsView 365, EntitiesView 345.
- `App.tsx` 562 LOC con 40 useState/useEffect.
- `Icons.tsx` 569 LOC con 40 exports importados desde 66 archivos.
- `src/lib/demo.ts` 595 LOC mezcla fixtures + loader.
- `_lib/embeddings.ts:113` hace fetch directo a OpenAI fuera de `_lib/llm/providers/`.
- `sqlTyped<Row>()` solo 32/65 .mts lo usan.
- `new Response(null, {status:204|202})` repetido en 7+ archivos sin helper `noContent()`.
- Handlers .mts gordos con POST+GET+PATCH+DELETE en un mismo switch.
- Lógica de agrupado por fecha duplicada en 4 lugares.
- `llm-rerank.ts` no enchufa el cache existente.
- `clientErrorTracking.ts + webVitals.ts` no espejados como `_lib/observability` backend.

**Riesgos:**

- PRs sobre vistas grandes >600 LOC + alto riesgo de regresión.
- Embeddings con fetch directo es foco silente.
- App.tsx con 40 hooks es god-component en gestación.

**Recomendaciones:**

- Mover embeddings dentro de `_lib/llm/providers/embeddings.ts`.
- Codemod 1-vez: migrar todos los `as unknown as Array<...>` a `sqlTyped<>`.
- Descomponer GraphView/TwitterView en hooks orquestadores.
- Splittear `Icons.tsx` por dominio.
- Crear `src/lib/dateGrouping.ts`.
- Helper `noContent(requestId)`.
- Activar cache en `llm-rerank`.

**Qué subiría la nota:** embeddings + sqlTyped + GraphView/TwitterView → 6. Destripar App.tsx + Icons.tsx → 7.

## Backlog priorizado

| Prioridad | Item                                                                                                                               | Dimensión | Evidencia                                                                                                                                                                          | Impacto                                                                             | Esfuerzo |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| P0        | Filtrar `chat_messages`/`chat_threads` por `user_id` en chat-messages.mts y ask.mts                                                | 4         | `chat-messages.mts:45-51,84-86,101-105,120-126,213-223` + `ask.mts:72-78`                                                                                                          | Cierra cross-user read/write del chat. Bloqueante para abrir multi-user             | S        |
| P0        | `shouldReembed` real en entities.mts y quotes.mts (comparar pre vs post-PATCH)                                                     | 5         | `entities.mts:253-258`, `quotes.mts:223-227`                                                                                                                                       | Elimina gasto recurrente de embeddings; cumple regla CLAUDE.md                      | S        |
| P0        | `checkMonthlyBudget` + `INSERT INTO extraction_log` en atlas.mts y cronicas.mts                                                    | 5         | `atlas.mts:222`, `cronicas.mts:214`                                                                                                                                                | Cierra dos boquetes que dejan el cap mensual bypaseable                             | S        |
| P0        | Provisioning de usuarios al primer login (webhook Clerk o upsert lazy en getAuthedUser)                                            | 13        | `_lib/auth.ts:60-99` + `roadmap.md:6`                                                                                                                                              | Bloquea apertura multi-user real                                                    | M        |
| P0        | Suite de tests de aislamiento por user_id en endpoints clave (entities, quotes, momentos, chat, search)                            | 13        | Solo `_lib/auth.test.ts:127` cubre IDs distintos                                                                                                                                   | Sin red de seguridad para PRs que olviden `AND user_id = ${userId}`                 | M        |
| P0        | Plan de cutover de `ALLOW_LEGACY_FALLBACK=false` + dejar de escribir `legacy-single-user`                                          | 13        | `_lib/auth.ts:94`, `error-log.mts:70`, `web-vitals.mts:47`, `observability.ts:65`, `momentos-upload.mts:45`                                                                        | Hoy una request sin token cae al dueño — peligroso al entrar otros usuarios         | S        |
| P0        | Arreglar `.env.example`: renombrar `NETLIFY_DATABASE_URL` → `NETLIFY_DB_URL` o documentar inline                                   | 12        | `.env.example:5` vs `_lib/db.ts:5-7` + CLAUDE.md:28                                                                                                                                | Onboarding local arranca con env var ignorada                                       | S        |
| P1        | Endurecer isolation-guardrail.test.ts a nivel sentencia (AST de cada SQL template)                                                 | 4         | `_lib/isolation-guardrail.test.ts:25-80` (regex per-archivo)                                                                                                                       | Evita que futuros endpoints repitan el agujero de chat-messages                     | M        |
| P1        | Pre-validar ownership de `entity_id`/`from_id`/`to_id` antes de INSERT                                                             | 4         | `quotes.mts:137,150`; `relationships.mts:117-126`; `momentos.mts:243-249`                                                                                                          | Evita pollution cross-user de la trama                                              | S        |
| P1        | Bloquear IPs privadas/loopback/link-local en momentos-url-preview antes del fetch                                                  | 6         | `momentos-url-preview.mts:65-95`                                                                                                                                                   | SSRF a metadata cloud (169.254.169.254) o servicios internos                        | S        |
| P1        | Detectar y bloquear deploy con `ALLOW_LEGACY_FALLBACK=true` en producción                                                          | 6         | `_lib/auth.ts:94-96`                                                                                                                                                               | Auth bypass silencioso si la env queda activa por accidente                         | S        |
| P1        | Sincronizar defaults de AI_MONTHLY_BUDGET_CENTS: docs dicen 5000, código usa 500 (10×)                                             | 5         | `cost-cap.ts:36`, `cost-alert-check.mts:34` vs `docs/incidentes.md:85`, `docs/ai.md:90`                                                                                            | Cap real es $5/mes sin env explícito — corte sorpresivo                             | S        |
| P1        | Corregir doc de ai.md que dice "devuelven 503" cuando cost-cap.ts devuelve 429                                                     | 5         | `docs/ai.md:92` vs `cost-cap.ts:88`                                                                                                                                                | Doc operacional incorrecto                                                          | S        |
| P1        | Agregar FK `user_id → users(id)` en notes, tasks, cronicas, atlas_snapshots, x_cronicas, x_tokens, x_bookmarks                     | 3         | Migraciones 20260528150000_atlas:21, 20260528130000_cronicas:18, 20260529000000_notes:14, 20260529140000_tasks:14, 20260530160000_x_cronicas:6, 20260530130000_x_integration:13,32 | Bloquea integridad referencial multi-user; deja huérfanos silenciosos               | S        |
| P1        | FK opcional (NOT VALID + VALIDATE) `entities.type→entity_types.slug` y `relationships.type→relationship_types.slug`                | 3         | `20260518200000_type_tables/migration.sql:3-4`; `entity-types.mts:59`                                                                                                              | Source of truth declarada en CLAUDE.md pero no enforced                             | M        |
| P1        | NOT NULL en extraction_log.user_id y error_log.user_id tras el backfill                                                            | 3         | `20260528000000_backfill_log_user_id/migration.sql:22`                                                                                                                             | Privacidad/atribución cuando se active multi-user real                              | S        |
| P1        | Fixear graph-neighbors.mts: agregar user_id al COUNT(\*) y reescribir como CTE                                                     | 7         | `graph-neighbors.mts:102-111`                                                                                                                                                      | Aislamiento multi-user correcto + latencia del subgrafo cae linealmente             | S        |
| P1        | Crear endpoint `/api/home` con featured quote server-side + counts + últimas N                                                     | 7         | `HomeView.tsx:50-52` + `docs/escala.md:46-47`                                                                                                                                      | Home deja de descargar la trama entera; primer paint sub-segundo a cualquier escala | M        |
| P1        | Memoizar isDimmed en GraphSvgCanvas con Set de vecinos del nodo seleccionado                                                       | 7         | `GraphSvgCanvas.tsx:184-189`                                                                                                                                                       | Selección en SVG 500-999 nodos deja de costar centenas de ms                        | S        |
| P1        | Reconciliar ARCHITECTURE.md con el stack real (Sigma, Clerk multi-user)                                                            | 1         | `ARCHITECTURE.md:25-26,200,273` vs `package.json:47,52` + `main.tsx:3` + migración 20260526                                                                                        | Devs/agentes nuevos toman decisiones contra un mapa falso                           | M        |
| P1        | Documentar en docs/arquitectura.md los flujos Momentos, Atlas, Crónicas, X bookmarks                                               | 1         | `netlify/functions/{momentos,atlas,cronicas,x-bookmarks,x-classify,x-cronica}.mts` no mencionados                                                                                  | ~30% de la superficie de endpoints sin mapa                                         | M        |
| P1        | Encapsular chips de severity en componente con data-tone y CSS vars; eliminar bg-red/amber/sky directos                            | 8         | `Sidebar.tsx:234,262-266,302,379-382`; `TopBar.tsx:181-196`; `ToastHost.tsx:54-56`                                                                                                 | Cumple disciplina editorial; habilita temas vela/dark                               | M        |
| P1        | Reemplazar outline-none por focus ring tintado (utility .input-paper) en inputs/textareas                                          | 8         | `TwitterView.tsx:324`, `CommandPalette.tsx:192`, `ChatView.tsx:362`, notas/\*                                                                                                      | WCAG 2.4.7 Focus Visible                                                            | S        |
| P1        | Reparar debounce de useUpdateEntityPosition con useRef                                                                             | 9         | `useEntities.ts:166-191`                                                                                                                                                           | Drag rápido en grafo deja de saturar `/api/entity-position`                         | S        |
| P1        | Centralizar queryKeys + invalidaciones cross-domain (cronología, atlas) tras mutations                                             | 9         | `queryClient.ts:16-27` solo 9 keys; useEntities/useQuotes/useMomentos/useNotes no invalidan cronologia/atlas                                                                       | Cronología y Atlas dejan de mostrar data vieja                                      | M        |
| P1        | Agregar onMutate + rollback a mutations de Momentos / Notas / Tasks create-delete                                                  | 9         | `useMomentos.ts:31-77`, `useNotes.ts:20-48`                                                                                                                                        | Paridad con entidades/citas/relaciones                                              | M        |
| P1        | Extraer ask.mts, atlas.mts, search.mts y suggest-relationships.mts a `*-endpoint.ts` + tests                                       | 10        | Sin `*-endpoint.test.ts` asociado                                                                                                                                                  | Caminos AI más caros sin tests de handler                                           | M        |
| P1        | Tests de integración SQL real contra el Postgres efímero del job migrations                                                        | 10        | `.github/workflows/test.yml` job migrations levanta pgvector                                                                                                                       | Cierra el gap mock-only que no detecta SQL bugs                                     | M        |
| P1        | Tests por endpoint de aislamiento user_id post multi-user                                                                          | 10        | Migración 20260526; `isolation*.test.ts` solo \_lib                                                                                                                                | Aislamiento es invariante de seguridad                                              | M        |
| P1        | Renombrar `NETLIFY_DATABASE_URL` → `NETLIFY_DB_URL` en .env.example y añadir Clerk + ALLOW_LEGACY_FALLBACK                         | 11        | `.env.example:4` vs `_lib/env.ts:114`                                                                                                                                              | Setup de dev funcional desde primer copy                                            | S        |
| P1        | Actualizar docs/deploy.md (líneas 22 y 78) para reflejar 5 jobs de CI reales y existencia de netlify.toml con CSP                  | 11        | `docs/deploy.md:22,78` vs `.github/workflows/test.yml:23-192` y `netlify.toml`                                                                                                     | Runbook deja de mentir bajo incidente                                               | S        |
| P1        | Documentar los 7 dominios nuevos en docs/conventions/dominios.md (Atlas, Cronología, Crónicas, Notes, Tasks, X/Twitter, Resonance) | 12        | `src/state/use{Atlas,Cronicas,Cronologia,Notes,Tasks,Twitter}.ts` + 6 migraciones sin entrada en docs                                                                              | Agente nuevo improvisa en zonas sin canon                                           | L        |
| P1        | Consolidar AGENTS.md como stub que apunte a CLAUDE.md (o symlink)                                                                  | 12        | AGENTS.md ≡ CLAUDE.md sin cross-reference                                                                                                                                          | Drift inevitable cuando se edite uno solo                                           | S        |
| P1        | Actualizar conteos hardcoded: 44→65 endpoints, 8→11 vistas, eliminar referencia SVG-only del grafo                                 | 12        | `README.md:144`, `docs/arquitectura.md:22+35`, `ARCHITECTURE.md:25`                                                                                                                | Stale-confidence                                                                    | S        |
| P1        | Corregir `docs/README.md:15` ("single-user por diseño")                                                                            | 12        | vs `README.md:264-282` + `roadmap.md:6`                                                                                                                                            | Mensaje contradictorio entre runbook y README                                       | S        |
| P1        | Cascade soft-delete a momentos/notas/tasks al borrar entidad                                                                       | 13        | `entities.mts:289-299`                                                                                                                                                             | Data orphan visible en UI; viola convención CLAUDE.md                               | S        |
| P1        | Migrar 409 duplicate de entities al shape canónico ApiError                                                                        | 13, 4     | `entities.mts:182-194`                                                                                                                                                             | Viola regla de CLAUDE.md                                                            | S        |
| P1        | Eliminar el hard-cap silencioso de 5000 entidades o documentarlo en UI                                                             | 13        | `entities.mts:51-67`                                                                                                                                                               | Usuario heavy ve truncamiento silencioso                                            | M        |
| P1        | useApiClient() con useAuth() de Clerk en el cliente                                                                                | 13        | `src/api/request.ts:169-188` (window.\_\_clerk)                                                                                                                                    | Acoplamiento a propiedad interna de Clerk                                           | M        |
| P1        | Auditar y eliminar los 12 eslint-disable de exhaustive-deps                                                                        | 13        | App.tsx:157, GraphView.tsx:371/381, ChatView.tsx:56, CommandPalette.tsx:122, etc.                                                                                                  | Cada uno es candidato a stale-closure                                               | M        |
| P1        | Bajar fetch de embeddings dentro de `_lib/llm/providers/embeddings.ts`                                                             | 14, 2     | `_lib/embeddings.ts:113`                                                                                                                                                           | Unifica abstracción, reusa fetchWithRetry                                           | S        |
| P1        | Completar adopción de sqlTyped<> (sweep mecánico)                                                                                  | 14, 2     | `_lib/db.ts:53`; 32/65 .mts; resto con `as unknown as Array<...>`                                                                                                                  | Consistencia de tipos                                                               | S        |
| P1        | Descomponer GraphView y TwitterView en hooks orquestadores                                                                         | 14        | `GraphView.tsx` 523 LOC, `TwitterView.tsx` 522 LOC                                                                                                                                 | Baja superficie cognitiva                                                           | M        |
| P2        | Migrar el 409 'possible_duplicate' al shape canónico {error:{code:CONFLICT,details:{suggestions}}}                                 | 4         | `entities.mts:182-194` + `docs/conventions/api.md:25`                                                                                                                              | Elimina única excepción al contrato                                                 | S        |
| P2        | Agregar auth (Clerk token) a momentos-url-preview y wikipedia-search                                                               | 4         | `momentos-url-preview.mts:50`; `wikipedia-search.mts:13`                                                                                                                           | Cierra SSRF parcial y abuso de cuota Wikipedia                                      | S        |
| P2        | Reemplazar `req.json().catch` en suggest-relationships por parseJsonBody+Zod                                                       | 4         | `suggest-relationships.mts:48`                                                                                                                                                     | Cierra último endpoint POST fuera del patrón canónico                               | S        |
| P2        | Uniformar shape de respuestas DELETE (200 {deletedAt} vs 204 vacío)                                                                | 4         | `chat-threads.mts:90` vs `entities.mts:298`/`quotes.mts:265`/`momentos.mts:388`                                                                                                    | Simplifica el cliente                                                               | S        |
| P2        | Envolver embed() en fetchWithRetry para 429/5xx transitorios                                                                       | 5         | `_lib/embeddings.ts:113-127` vs `_lib/llm/retry.ts:31`                                                                                                                             | Menos huecos en indexado                                                            | S        |
| P2        | Loguear gasto de embeddings en extraction_log para que cuente al cap                                                               | 5         | `_lib/embeddings.ts:100-137` no inserta en extraction_log                                                                                                                          | Reindex masivo puede gastar fuera del cap                                           | M        |
| P2        | Agregar logEvent('cost_cap_fail_open') cuando safeSql() retorna null                                                               | 5         | `_lib/cost-cap.ts:44`                                                                                                                                                              | Visibilidad de cuándo el cap NO funciona                                            | S        |
| P2        | Wrapping de delimitadores anti-prompt-injection en chat-prompt y extract-prompt                                                    | 6         | `_lib/extract-prompt.ts:53`, `_lib/chat-prompt.ts:166-171`                                                                                                                         | Reduce riesgo de propuestas destructivas                                            | M        |
| P2        | Backfill de blob keys legacy y quitar bypass de auth                                                                               | 6         | `momentos-file.mts:48`                                                                                                                                                             | Cierra superficie residual sin auth                                                 | M        |
| P2        | Agregar CSP report-to/report-uri                                                                                                   | 6         | `netlify.toml:43`                                                                                                                                                                  | Detecta regresiones de CSP en prod                                                  | S        |
| P2        | Rate-limit por user (no IP) en url-preview y upload                                                                                | 6         | `momentos-url-preview.mts` sin rate-limit                                                                                                                                          | Evita uso como proxy de scraping/SSRF                                               | M        |
| P2        | Test de integración SSRF: 169.254.169.254 y 127.0.0.1 deben devolver 400/empty                                                     | 6         | no existe en `_lib/*.test.ts`                                                                                                                                                      | Regresión cubierta automáticamente                                                  | S        |
| P2        | Plan de saneamiento para referencias soft: linked_quote_ids, source_entity_ids, atlas memberIds, promoted_momento_id               | 3         | 20260521030000_quotes_reflections:20, 20260528130000_cronicas:21, 20260528150000_atlas:16, 20260529000000_notes:20                                                                 | IDs huérfanos tras soft-delete                                                      | M        |
| P2        | Índice sobre momento_entities(user_id) si se va a filtrar sin join                                                                 | 3         | 20260524100000_momentos:64 + 20260526000000_multi_user:65                                                                                                                          | Posible seq scan a escala                                                           | S        |
| P2        | Unificar patrón 'uno por usuario' entre spotify_tokens/ai_task_providers/atlas_snapshots/x_tokens                                  | 3         | 20260520, 20260526:152, 20260528150000:31, 20260530130000:13                                                                                                                       | Cognitive load                                                                      | S        |
| P2        | Romper dependencia wholesale de entities en RelationshipsView: from_name/to_name vía JOIN                                          | 7         | `RelationshipsView.tsx:35` + `docs/escala.md:49-53`                                                                                                                                | Lista de relaciones funciona >5k entidades                                          | M        |
| P2        | Extender check-bundle-size.mjs con budgets para chunks lazy críticos                                                               | 7         | `scripts/check-bundle-size.mjs:22-31` + :79                                                                                                                                        | Drift silencioso se detecta en CI                                                   | S        |
| P2        | Medir cold-start de funciones representativas y considerar dispatch dinámico de providers                                          | 7         | `netlify.toml` (esbuild) + imports estáticos                                                                                                                                       | Latencia percibida en primera invocación                                            | L        |
| P2        | Migrar text-xs/sm/2xl legacy → text-caption/body/h2 en home/quotes/chat                                                            | 8         | 434 ocurrencias totales; home/FeaturedQuote.tsx:61,80; home/Greeting.tsx:46; etc.                                                                                                  | Coherencia con design.md                                                            | M        |
| P2        | Añadir clase .touch-target (≥44×44) en icon buttons mobile y sidebar colapsado                                                     | 8         | `design.md:71-72` marca el gap; `Sidebar.tsx:311`                                                                                                                                  | WCAG 2.5.5 Target Size                                                              | S        |
| P2        | Normalizar icon sizes fuera de la escala (16/20/26) → 14, 18 o 22                                                                  | 8         | TopBar:112, MobileBottomNav:108, GabineteView:97, WorldSwitcher:126, ViewRouter:105, momentos/PhotoLightbox:158,165, HojaEditor:243                                                | Coherencia del sistema de 5 tamaños                                                 | S        |
| P2        | Documentar o eliminar text-[Npx] sin justificación inline                                                                          | 8         | notas/markdown.tsx:35,241; notas/ActivityCalendar.tsx:184                                                                                                                          | Disciplina del "no arbitrary values"                                                | S        |
| P2        | Investigar bg-ink-900/30 en Sidebar.tsx:284 (no existe en tailwind.config)                                                         | 8         | Sidebar.tsx:284 vs tailwind.config.js:33-43                                                                                                                                        | Backdrop posiblemente roto silenciosamente                                          | S        |
| P2        | Serializar mutations sobre el mismo recurso con mutationKey/scope                                                                  | 9         | `useQuotes.ts:192-245` y equivalentes                                                                                                                                              | Dos edits rápidos no se revierten en cascada                                        | M        |
| P2        | Definir estrategia para drift offline → online (sync o bloqueo total de writes offline)                                            | 9         | useEntities/useQuotes/useRelationships offline rama; sin reconciliación                                                                                                            | Riesgo de pérdida o divergencia                                                     | L        |
| P2        | Guard contra sends concurrentes en useSendChatMessage                                                                              | 9         | `useChat.ts:73-86`                                                                                                                                                                 | Dos sends solapados pisan refs                                                      | S        |
| P2        | Reducir dependencia de useEntitiesQuery/useQuotesQuery wholesale fuera de EntitiesView/QuotesView                                  | 9         | `useQuotes.ts:62-67`                                                                                                                                                               | MB descargados por sesión a escala                                                  | M        |
| P2        | Extraer endpoint tests para extract-from-image, proactive-suggestions, reclassify-entities, reindex-embeddings                     | 10        | sin `*-endpoint.test.ts` para estos 4                                                                                                                                              | Cobertura faltante                                                                  | M        |
| P2        | Documentar criterio extract-endpoint en docs/conventions/api.md                                                                    | 10        | Patrón presente en 23 de 65 handlers sin criterio explícito                                                                                                                        | Reduce ambigüedad en PRs nuevos                                                     | S        |
| P2        | Subir coverage thresholds tras cada PR con tests nuevos                                                                            | 10        | `vitest.config.ts:60` comenta explícitamente subir el piso                                                                                                                         | Trinquete de cobertura                                                              | S        |
| P2        | Auditar e2e/fixtures.ts contra schemas Zod reales del backend                                                                      | 10        | `playwright.config.ts:9-14` mockea /api/\*                                                                                                                                         | Drift entre mock e2e y respuesta real                                               | S        |
| P2        | Smoke test post-deploy: GitHub Action que golpee 3-4 endpoints clave tras push a main                                              | 11        | sin verificación post-deploy automatizada                                                                                                                                          | Detecta deploys verdes que rompen runtime                                           | M        |
| P2        | Alinear runner de migraciones CI con el de Netlify o documentar la divergencia                                                     | 11        | `scripts/apply-migrations.sh` tabla `_migrations`; Netlify usa `_netlify_database_migrations`                                                                                      | Cierra gap "pasa CI" vs "aplica en Neon"                                            | M        |
| P2        | Inventariar las 3 scheduled functions (cost-alert-check, spotify-scheduled-sync, x-scheduled-sync) en docs                         | 11        | Crons inline en .mts; sin runbook centralizado                                                                                                                                     | Dónde mirar primero si un cron deja de correr                                       | S        |
| P2        | Unificar URL del proyecto Netlify en docs (sites/trama vs projects/tramadaod)                                                      | 11        | `docs/deploy.md:14` vs `docs/observability.md:91`                                                                                                                                  | Una sola URL canónica                                                               | S        |
| P2        | Arreglar comando `npm run test:e2e` en README.md:253 (script real es `e2e`)                                                        | 12        | README.md:253 vs package.json:15                                                                                                                                                   | Copia/pega falla                                                                    | S        |
| P2        | Completar docs/conventions/llm.md con askLLMForVision + clearLLMCache + AI_VISION_PROVIDER                                         | 12        | `_lib/llm.ts:11-16` exporta 5; doc menciona 3                                                                                                                                      | Vision path fuera del canon documentado                                             | S        |
| P2        | Listar docs/observability.md en CLAUDE.md y docs/README.md                                                                         | 12        | doc huérfana de 112 LOC                                                                                                                                                            | Conocimiento operacional no descubrible                                             | S        |
| P2        | Completar lista de hooks en docs/conventions/data.md                                                                               | 12        | `docs/conventions/data.md:23-29` vs `ls src/state/`                                                                                                                                | Doc de capa de estado incompleto                                                    | S        |
| P2        | Implementar streaming nativo en providers Anthropic y Gemini                                                                       | 13        | `docs/conventions/roadmap.md:9`                                                                                                                                                    | Latencia percibida del chat al promover uno de los dos                              | M        |
| P2        | UI de gestión de tipos (entity_types, relationship_types)                                                                          | 13        | `docs/conventions/roadmap.md:8`                                                                                                                                                    | Hoy el usuario no puede expandir taxonomía sin SQL                                  | M        |
| P2        | Search dentro de hilos de chat (UX, no solo backend)                                                                               | 13        | `roadmap.md:10` + `search.mts:163-176`                                                                                                                                             | Capacidad latente sin superficie                                                    | S        |
| P2        | Partir Icons.tsx (569 LOC), GraphView.tsx (523), TwitterView.tsx (522), MomentosView.tsx (405)                                     | 13, 14    | `wc -l src/components/*.tsx`                                                                                                                                                       | Velocidad de cambio y HMR                                                           | L        |
| P2        | Cost-cap + Spotify per-usuario (limpiar supuesto single-user)                                                                      | 13        | `_lib/spotify/auth.ts:4-7` + `roadmap.md:6` (punto 4)                                                                                                                              | Al abrir a familia, un user puede consumir todo el cap                              | L        |
| P2        | Limpiar legacy back-compat de momentos (`storageKey` singular vs `items[]`)                                                        | 13        | `_lib/momento-schemas.ts:53`, `momentos-merge.mts:50`, `momentos-orphaned-blobs.mts:113`                                                                                           | Mantenimiento eterno de dos paths                                                   | M        |
| P2        | Splittear Icons.tsx por dominio                                                                                                    | 14        | `Icons.tsx` 569 LOC, 40 exports, 66 importadores                                                                                                                                   | Localiza cambios                                                                    | S        |
| P2        | Extraer src/lib/dateGrouping.ts y migrar vistas                                                                                    | 14        | `momentos/helpers.ts:88`, `CronologiaView.tsx:58`, inline en TwitterView y ListeningView                                                                                           | Una implementación testeada                                                         | S        |
| P2        | Aplastar App.tsx: useCommandHandlers() + modales lazy                                                                              | 14        | `App.tsx` 562 LOC, 40 hooks, switch en 419-437                                                                                                                                     | App.tsx pasa a router puro                                                          | M        |
| P2        | Helper noContent(requestId) y reemplazar new Response(null,{status:204\|202})                                                      | 14        | ai-settings:77,102; chat-threads:90; entity-types:60; cost-alert-check:57,83,100,157                                                                                               | Shape uniforme con ApiErrors                                                        | S        |
| P2        | Splittear extract-validate.ts por kind de edit                                                                                     | 14        | `_lib/extract-validate.ts` 346 LOC                                                                                                                                                 | Lectura simple, agregar kinds no toca todo                                          | S        |
| P2        | Separar src/lib/demo.ts en data + loader                                                                                           | 14        | `src/lib/demo.ts` 595 LOC                                                                                                                                                          | Fixture inerte tree-shakable                                                        | M        |
| P2        | Activar cache de \_lib/llm/cache.ts en llm-rerank                                                                                  | 14        | `_lib/llm-rerank.ts` docstring de costo, sin cache                                                                                                                                 | Queries repetidas no pagan API                                                      | S        |
| P2        | Actualizar contador '44 endpoints' en docs/arquitectura.md:35 a 65 o dinamizarlo                                                   | 1         | `docs/arquitectura.md:35` vs `ls netlify/functions/*.mts \| wc -l = 65`                                                                                                            | Indicador de que el doc no se revisa con el código                                  | S        |
| P2        | Script o test que verifique consistencia entre conteos declarados en docs/ y realidad                                              | 1         | dos números stale detectados                                                                                                                                                       | Mantiene mapas alineados sin disciplina manual                                      | S        |
| P2        | Migrar aiOffResponse() a ApiErrors con código AI_DISABLED                                                                          | 2         | `_lib/ai-mode.ts:106`                                                                                                                                                              | Restaura shape canónica de error                                                    | S        |
| P2        | Terminar migración a sqlTyped<Row>() en mts restantes                                                                              | 2         | 37 casts viejos vs 151 sqlTyped; momentos.mts:230,265                                                                                                                              | Type-safety completo en frontera SQL→TS                                             | M        |
| P2        | Documentar o consolidar embeddings dentro de \_lib/llm/                                                                            | 2         | `_lib/embeddings.ts:113`                                                                                                                                                           | Evita que futuros casos repliquen el bypass                                         | S        |

## Zonas no auditadas

- **\_lib/db.ts** (implementación actual de getSql) — no leído en este pase. (Dim. 1)
- **src/state/** división por dominio — no inspeccionada más allá del inventario. (Dim. 1)
- **\_lib/handler-wrap.ts** — no leído en detalle. (Dim. 1)
- **Conteo exacto de vistas en ViewRouter** — declarado 8 en docs, declarado 11 en hallazgos pero no contado uno por uno. (Dim. 1, 12)
- **dispatch.ts y cache.ts** de `_lib/llm/` — solo se confirmó presencia. (Dim. 1)
- **Migraciones SQL leídas** — no todas; tampoco se corrieron EXPLAIN reales. (Dim. 3)
- **DEFAULT 'legacy-single-user' en cada tabla** — solo se chequearon cronicas y x/classify. (Dim. 3)
- **Endpoints Spotify y X OAuth callback** — no leídos en detalle. (Dim. 4, 6)
- **Tests de integración individuales** — no abiertos uno por uno. (Dim. 4, 10)
- **Cliente src/api/** — transforms snake↔camel y manejo de ApiClientError. (Dim. 4, 9)
- **Cobertura efectiva del isolation-guardrail** bajo cambio sintético. (Dim. 4)
- **Eficacia real del cache LLM** (hit rate en producción). (Dim. 5)
- **Race conditions del fire-and-forget INSERT INTO extraction_log** bajo carga concurrente. (Dim. 5)
- **HealthPanel UI** (Settings → Health) — solo el endpoint, no la presentación. (Dim. 5)
- **Spotify-library-snapshot.mts, voz.mts, x-cronica.mts** end-to-end flujo. (Dim. 5)
- **Endpoints de chat/extract** línea por línea — solo prompts y rag-context. (Dim. 6)
- **OAuth Spotify/X callback** (state CSRF, code verifier). (Dim. 6)
- **error_log persistiendo PII en stack traces**. (Dim. 6)
- **momentos-merge.mts, momentos-restore.mts**. (Dim. 6)
- **Validación de provider override desde el cliente**. (Dim. 6)
- **Clerk webhooks** y middleware de session refresh. (Dim. 6)
- **CI corriendo gitleaks** — lo dice SECURITY.md pero no se leyó test.yml en ese punto. (Dim. 6)
- **Cold-start real de funciones Netlify** — no se midió. (Dim. 7)
- **Tamaño efectivo de cada chunk lazy** — no se corrió build. (Dim. 7)
- **Endpoints menos críticos**: notes, x-_, cronicas-_, tasks. (Dim. 7)
- **Métricas reales de latencia LLM y rerank** — Settings → Health no inspeccionado. (Dim. 7)
- **Verificación visual real de contraste con axe-core** — solo grep. (Dim. 8)
- **Comportamiento en theme-vela y dark de chips con colores hardcoded**. (Dim. 8)
- **Keyboard navigation y focus trap de modals**. (Dim. 8)
- **Mobile responsive y touch targets en dispositivos reales**. (Dim. 8)
- **Animaciones en runtime y prefers-reduced-motion**. (Dim. 8)
- **Sigma/WebGL graph rendering** fuera de scope visual. (Dim. 8)
- **Tests existentes de cada hook** — no se verificó qué cubren. (Dim. 9)
- **src/api/ transforms** — drift de shape entre server y optimistic. (Dim. 9)
- **refetchOnWindowFocus + staleTime con multi-tab** + Clerk. (Dim. 9)
- **Hooks Spotify** (embebidos en panels). (Dim. 9)
- **Streaming useChat thrashing** del render con muchas chunks. (Dim. 9)
- **Contenido real de cada test** — leídos samples, no los 100. (Dim. 10)
- **Coverage report concreto** (lcov-report no parseado). (Dim. 10)
- **Tests de a11y vía axe** — no leí `a11y.spec.ts`. (Dim. 10)
- **scripts/check-bundle-size.mjs y .gitleaks.toml** — referenciados, no inspeccionados. (Dim. 10)
- **Posibles flakes históricos** (Playwright retries:2). (Dim. 10)
- **Config real de Netlify** (dashboard, env vars, branch deploy previews). (Dim. 11)
- **Output real de los 5 jobs en CI**. (Dim. 11)
- **.github/dependabot.yml ni renovate**. (Dim. 11)
- **Protected branch rules en GitHub**. (Dim. 11)
- **@netlify/database CLI dry-run**. (Dim. 11)
- **docs/datos.md, docs/deploy.md detalle, docs/incidentes.md detalle, docs/escala.md detalle, docs/migracion-multi-user.md, docs/observability.md, docs/component-audit-ff3.md, docs/changelog/sprints-historicos.md ni los 9 ADRs**. (Dim. 12)
- **Accuracy de snippets de código de cada doc de conventions**. (Dim. 12)
- **Completitud de runbooks operacionales contra flujos reales**. (Dim. 12)
- **Issue/PR templates en .github/, SECURITY.md detalle, CODE_OF_CONDUCT.md**. (Dim. 12)
- **No corrió tests ni `tsc -b`**. (Dim. 13)
- **Las 65 functions individualmente** — quedó en hotspots. (Dim. 13)
- **Performance real del bundle** — solo se contaron LOC. (Dim. 13)
- **docs/conventions/data.md ni dominios.md** detalle. (Dim. 13)
- **Migrations intermedios** drift de schema vs código. (Dim. 13)
- **Subdirs settings/ ni entities/** completos. (Dim. 14)
- **Coverage real de tests vs código de producción**. (Dim. 14)
- **Comparación cronicas.mts vs proactive-suggestions.mts** posible duplicación. (Dim. 14)
- **spotify-sync.mts ni x-sync.mts** profundamente. (Dim. 14)

Cobertura agregada: alta en arquitectura, datos, APIs, LLM, seguridad y testing; media en UX/diseño, performance y CI; baja en runtime real (cold-starts, hit rate de cache, accesibilidad ejecutada, e2e contra DB real). El bajo nivel de auditoría runtime/e2e no debería mover la nota global más de un punto si llegaran sorpresas; las P0 y P1 listadas son verificables sin runtime.
