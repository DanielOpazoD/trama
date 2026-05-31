# Auditoria senior de Trama - Codex - 2026-05-31

## Resumen ejecutivo

Salud general: **4/7**. Trama tiene una base solida: React/Vite + Netlify Functions + Postgres/pgvector + Netlify Blobs + Clerk + LLM multiproveedor estan bien encaminados (`package.json:6-24`, `netlify.toml:1-49`, `netlify/functions/_lib/db.ts:1-20`, `src/main.tsx:1-32`). Pero el estado actual no esta listo para multi-user amplio: chat y algunos inserts aceptan IDs de otros usuarios, el cap de costos no cubre todos los caminos LLM, y varios documentos operacionales ya contradicen el codigo.

Fortalezas reales: `getSql()` encapsula Netlify Database y evita `NETLIFY_DATABASE_URL` directo (`netlify/functions/_lib/db.ts:1-20`); el contrato de errores canonico existe y esta documentado en codigo (`netlify/functions/_lib/api-error.ts:1-140`); CI cubre lint, format, typecheck, tests, coverage, build, audit, bundle, e2e, secrets y migraciones (`.github/workflows/test.yml:23-192`).

Riesgos mayores: P0 de aislamiento en chat (`netlify/functions/chat-messages.mts:45-51`, `netlify/functions/chat-messages.mts:84-86`, `netlify/functions/chat-messages.mts:101-126`, `netlify/functions/ask.mts:71-78`); bypass de costo/observabilidad en Atlas y Cronicas (`netlify/functions/atlas.mts:219-225`, `netlify/functions/cronicas.mts:210-217`); re-embedding innecesario en Entities/Quotes (`netlify/functions/entities.mts:250-284`, `netlify/functions/quotes.mts:221-255`).

Si solo se puede hacer una cosa esta semana: cerrar aislamiento multi-user en chat y en inserts con foreign IDs, con tests de endpoint que fallen si falta `user_id`.

## Alcance verificado

- Inventario vivo: 65 Netlify Functions, 39 migraciones, 159 archivos de test, 36 archivos en `src/state/`, 31 docs bajo `docs/` (comandos `find`/`rg`, 2026-05-31).
- Leidos/contrastados: `AGENTS.md`, `CLAUDE.md`, `package.json`, `netlify.toml`, `.github/workflows/test.yml`, docs principales de conventions/runbooks, hot paths de functions, migraciones base/multi-user/dominios recientes, estado cliente, grafo, chat y transforms.
- No ejecutado: `npm test`, `npm run typecheck`, `npm run build`, Playwright, EXPLAIN contra Postgres real, axe visual. Este informe es auditoria estatica con evidencia de codigo.

## Reglas violadas

- **Errores via `ApiErrors.*`**: `aiOffResponse()` devuelve texto plano con `new Response(..., 423)` en vez del shape canonico (`netlify/functions/_lib/ai-mode.ts:104-107`; regla en `docs/conventions/api.md:22-31`).
- **No re-embedear en PATCH sin cambio real**: Entities y Quotes disparan embedding por campo presente, aunque el valor sea igual (`netlify/functions/entities.mts:250-284`, `netlify/functions/quotes.mts:221-255`; regla en `AGENTS.md:35`).
- **No llamar APIs LLM directo fuera de `_lib/llm/`**: embeddings hace `fetch('https://api.openai.com/v1/embeddings')` directo (`netlify/functions/_lib/embeddings.ts:16-17`, `netlify/functions/_lib/embeddings.ts:112-127`; regla en `docs/conventions/llm.md:1-17`).
- **`NETLIFY_DB_URL`, no `NETLIFY_DATABASE_URL`**: `.env.example` todavia documenta la variable retirada (`.env.example:4`; regla en `docs/conventions/data.md:14-17`).
- **Soft-delete cascade incompleto**: DELETE de entidad cascadea relationships/quotes, pero no limpia links `momento_entities` ni notas/tareas relacionadas (`netlify/functions/entities.mts:289-298`; regla en `AGENTS.md:13`).
- **Zod en inputs externos**: `suggest-relationships` parsea body con `req.json().catch(() => ({}))` sin schema (`netlify/functions/suggest-relationships.mts:42-49`; regla en `docs/conventions/api.md:3-18`).
- **Docs operacionales stale**: deploy dice que `netlify.toml` no existe, pero si existe y define CSP/HSTS (`docs/deploy.md:78`, `netlify.toml:1-49`).

## 1. Mapa del sistema

**Hallazgos**

- Stack real: frontend React 18 + Vite + Tailwind + TanStack Query (`package.json:6-24`, `package.json:37-55`); backend Netlify Functions (`netlify.toml:13-14`); DB via `@netlify/database`/Neon HTTP (`netlify/functions/_lib/db.ts:1-20`); blobs en Netlify Blobs para Momentos (`docs/conventions/data.md:35-55`); Clerk en cliente/backend (`src/main.tsx:1-32`, `netlify/functions/_lib/auth.ts:1-12`); LLM multiproveedor en `_lib/llm/` (`netlify/functions/_lib/llm/dispatch.ts:1-11`).
- Ingesta citas/notas: cliente usa transforms snake_case/camelCase (`src/api/transform.ts:1-8`); entities/quotes insertan con `origin` JSONB y embeddings best-effort (`netlify/functions/entities.mts:198-222`, `netlify/functions/quotes.mts:150-173`); notes tienen CRUD propio (`netlify/database/migrations/20260529000000_notes/migration.sql:12-25`).
- Extraccion IA y propuestas: endpoints usan `askLLMForJson` + validators (`netlify/functions/ask.mts:164-203`, `netlify/functions/suggest-relationships.mts:112-168`); el chat parsea trailers de propuestas en servidor (`netlify/functions/chat-messages.mts:209-223`).
- Chat RAG: `ask` y `chat-messages` cargan contexto con RAG/HyDE (`netlify/functions/ask.mts:94-114`, `netlify/functions/chat-messages.mts:133-142`).
- Grafo: vista SVG tiene path O(N\*R) al seleccionar (`src/components/graph/GraphSvgCanvas.tsx:178-190`); explore usa `/api/graph/neighbors` (`netlify/functions/graph-neighbors.mts:7-30`); docs viejos todavia hablan de SVG casero a migrar (`ARCHITECTURE.md:25`, `ARCHITECTURE.md:200`).
- Momentos: dominio temporal con `kind`, `payload jsonb`, blobs y links N:M (`docs/conventions/dominios.md:23-75`, `netlify/functions/momentos.mts:18-37`).
- Bookmarks de X: migracion crea tokens/bookmarks por `user_id` (`netlify/database/migrations/20260530130000_x_integration/migration.sql:1-46`).

**Riesgos**

- `ARCHITECTURE.md` y `docs/arquitectura.md` pueden guiar decisiones contra la realidad actual: 44 endpoints documentados vs 65 reales (`README.md:201`, `docs/arquitectura.md:35`).

**Recomendaciones**

- Reconciliar `ARCHITECTURE.md`, `docs/arquitectura.md` y README con Sigma/Clerk/Momentos/Atlas/Cronicas/X.

## 2. Arquitectura y modularidad

**Hallazgos**

- Buena separacion de capas: `_lib/llm/dispatch.ts` resuelve provider/cache/fallback/retry en un punto (`netlify/functions/_lib/llm/dispatch.ts:118-190`); `getSql()` evita acoplar handlers a `@netlify/database` (`netlify/functions/_lib/db.ts:12-20`).
- Frontera cliente/servidor clara: transforms concentrados en `src/api/transform.ts` (`src/api/transform.ts:86-163`).
- Grietas: embeddings no usa el subsistema `_lib/llm/` (`netlify/functions/_lib/embeddings.ts:112-127`); `aiOffResponse()` se sale del contrato (`netlify/functions/_lib/ai-mode.ts:104-107`); `sqlTyped<Row>()` convive con casts manuales en handlers (`netlify/functions/_lib/db.ts:22-55`, `netlify/functions/chat-messages.mts:45-51`).

**Riesgos**

- Los bypasses pequenos se vuelven patrones copiados: LLM directo, errores fuera de shape, casts no validados.

**Recomendaciones**

- Mover embeddings a un provider/servicio bajo `_lib/llm/` o documentar excepcion formal; migrar `aiOffResponse` a `ApiErrors.aiDisabled`; sweep de casts a `sqlTyped`.

## 3. Modelo de datos

**Hallazgos**

- Base correcta: `origin` es JSONB con `CHECK (origin ? 'kind')` en entidades/relaciones/citas (`netlify/database/migrations/20260518000000_initial_schema/migration.sql:14-27`, `:35-46`, `:54-65`).
- Soft-delete existe en tablas de dominio base (`netlify/database/migrations/20260518000000_initial_schema/migration.sql:26`, `:45`, `:64`) y Momentos (`netlify/database/migrations/20260524100000_momentos/migration.sql:27-40`).
- Type tables son fuente de datos, pero no FK strict por diseno futuro (`netlify/database/migrations/20260518200000_type_tables/migration.sql:1-19`).
- Multi-user agrego FK a tablas existentes en 20260526 (`netlify/database/migrations/20260526000000_multi_user_schema/migration.sql:43-80`), pero migraciones posteriores como `cronicas`, `atlas_snapshots`, `notes`, `tasks`, `x_tokens`, `x_bookmarks` declaran `user_id text` sin `REFERENCES users(id)` (`netlify/database/migrations/20260528130000_cronicas/migration.sql:12-28`, `netlify/database/migrations/20260528150000_atlas/migration.sql:19-31`, `netlify/database/migrations/20260529000000_notes/migration.sql:12-24`, `netlify/database/migrations/20260529140000_tasks/migration.sql:12-27`, `netlify/database/migrations/20260530130000_x_integration/migration.sql:11-39`).
- Migraciones revisadas por rol: initial schema, extraction/error logs, type tables, search, Spotify, chat, embeddings, scale indexes, Momentos, LLM cache, alert state, multi-user, budget/backfill, vitals, resonance, cronicas, atlas, notes, quote link, tasks, wikipedia/grokipedia, X. Riesgos concretos arriba; no se corrio cada una sobre DB real.

**Riesgos**

- FKs faltantes generan huerfanos multi-user; `momento_entities` puede borrar hard por FK aunque el canon de dominio sea soft-delete (`netlify/database/migrations/20260524100000_momentos/migration.sql:59-68`).

**Recomendaciones**

- Nueva migracion: FK `user_id -> users(id)` en tablas post-20260526; `NOT VALID` para `entities.type`/`relationships.type` si se quiere enforcement gradual; revisar referencias blandas JSON/arrays.

## 4. APIs y contratos

**Hallazgos**

- P0: `chat-messages` obtiene y escribe mensajes por `thread_id` sin filtrar `user_id` (`netlify/functions/chat-messages.mts:45-51`, `:84-86`, `:101-126`, `:213-231`).
- P0/P1: `ask` lee historial y crea thread sin `user_id`, entonces puede mezclar o crear bajo default legacy (`netlify/functions/ask.mts:71-78`, `:252-257`, `:265-286`).
- P1: `quotes` busca `entity_id` sin `user_id` antes de insertar (`netlify/functions/quotes.mts:133-139`); `relationships` inserta `from_id/to_id` sin validar ownership (`netlify/functions/relationships.mts:110-128`); `momentos` inserta `momento_entities` sin validar que las entidades pertenezcan al usuario (`netlify/functions/momentos.mts:236-249`).
- Buen patron: `chat-threads` si filtra `t.user_id = ${userId}` y crea threads con `user_id` (`netlify/functions/chat-threads.mts:37-64`).
- Inconsistencia de contrato permitida pero costosa: duplicate entity devuelve legacy `{ error: 'possible_duplicate' }` (`netlify/functions/entities.mts:180-194`, `src/api/request.ts:121-135`).

**Riesgos**

- Con UUIDs conocidos o filtrados, un usuario puede leer/escribir historial de chat ajeno o asociar citas/relaciones a entidades ajenas.

**Recomendaciones**

- Agregar `AND user_id = ${userId}` en chat queries y `user_id` en inserts; validar ownership de foreign IDs antes de INSERT; testear endpoints con dos usuarios.

## 5. LLM, costos y observabilidad

**Hallazgos**

- LLM principal tiene cache en memoria + Postgres, retry/fallback transitorio y calculo de costo (`netlify/functions/_lib/llm/dispatch.ts:138-190`).
- Cap mensual es per-user si hay `users.monthly_budget_cents`, pero default de codigo es 500 centavos ($5) (`netlify/functions/_lib/cost-cap.ts:32-37`); docs dicen 5000 centavos ($50) y 503 (`docs/ai.md:88-93`), mientras codigo devuelve 429 (`netlify/functions/_lib/cost-cap.ts:83-93`).
- Atlas y Cronicas llaman LLM sin `checkMonthlyBudget` y sin `INSERT INTO extraction_log` (`netlify/functions/atlas.mts:219-225`, `netlify/functions/cronicas.mts:210-217`, contraste con `netlify/functions/ask.mts:61-62`, `netlify/functions/ask.mts:232-246`).
- Embeddings no se contabilizan en `extraction_log` y usan fetch directo (`netlify/functions/_lib/embeddings.ts:100-137`).

**Riesgos**

- El gasto real puede superar el dashboard/cap; docs pueden hacer diagnosticar el status equivocado.

**Recomendaciones**

- `checkMonthlyBudget` + log de `extraction_log` en Atlas/Cronicas; alinear default 500 vs 5000 y 429 vs 503; contabilizar o documentar embeddings.

## 6. Seguridad

**Hallazgos**

- Headers fuertes: CSP, HSTS, XFO DENY, nosniff, referrer-policy y permissions-policy (`netlify.toml:17-49`).
- Clerk backend contempla legacy fallback (`netlify/functions/_lib/auth.ts:60-99`); roadmap reconoce que falta provisioning y cerrar `ALLOW_LEGACY_FALLBACK` (`docs/conventions/roadmap.md:6`).
- SSRF: url-preview valida protocolo http(s), pero no bloquea loopback/RFC1918/link-local antes de `fetch(url)` (`netlify/functions/momentos-url-preview.mts:58-67`, `:81-95`).
- Wikipedia search no autentica antes de llamar upstream (`netlify/functions/wikipedia-search.mts:13-23`).
- Netlify Blobs solo aparece en functions, no en cliente (`netlify/functions/momentos-upload.mts:2`, `netlify/functions/momentos-file.mts:2`, `src/api/momentos.ts:177-199`).
- `dangerouslySetInnerHTML` esta limitado al QR modal con comentario de threat model (`src/components/momentos/MomentoQRModal.tsx:141-158`); markdown propio evita HTML directo segun comentario (`src/components/notas/markdown.tsx:5`).

**Riesgos**

- `momentos-url-preview` puede ser proxy SSRF; fallback legacy puede convertirse en bypass si queda activo en prod.

**Recomendaciones**

- Resolver DNS y bloquear IP privadas/link-local/loopback; auth o quota por usuario para preview/Wikipedia; check de deploy que alerte si fallback legacy queda activo en produccion.

## 7. Performance y escala

**Hallazgos**

- Escala documentada: modo explore recomendado a 2000+ y caps duros a 5000/10000 (`docs/escala.md:10-21`, `docs/escala.md:88-90`).
- `entities` y `relationships` tienen paginacion, pero mantienen modo wholesale para compatibilidad (`netlify/functions/entities.mts:47-68`, `netlify/functions/relationships.mts:39-58`).
- Home descarga entities, quotes y relationships completos (`src/components/HomeView.tsx:49-52`).
- `GraphSvgCanvas` hace `relationships.some()` dentro de `entities.map` al seleccionar (`src/components/graph/GraphSvgCanvas.tsx:178-190`).
- `graph-neighbors` filtra usuario en traversal/edges, pero los `COUNT(*)` de degree no filtran `user_id` (`netlify/functions/graph-neighbors.mts:98-111`).
- `RelationshipsView` reconoce que sigue dependiendo de `useEntitiesQuery()` wholesale para resolver nombres (`src/components/RelationshipsView.tsx:31-35`).

**Riesgos**

- A escala, portada y relaciones descargan MB innecesarios; degree puede mezclar conteo cross-user y costar mas de lo necesario.

**Recomendaciones**

- Endpoint `/api/home` liviano; memoizar vecinos seleccionados como `Set`; agregar `rr.user_id = ${userId}` y CTE en degree; JOIN de nombres en relationships paginado.

## 8. Frontend, UX y diseno

**Hallazgos**

- Convenciones son claras: type scale, icon sizes, tracking y focus visibles (`docs/conventions/design.md:3-75`), filosofia editorial con cero paleta arcoiris (`docs/conventions/filosofia-estetica.md:20-43`).
- Hay desvio real de colores genericos: sidebar usa `bg-red`, `bg-amber`, `bg-sky` para health alerts (`src/components/Sidebar.tsx:257-266`, `src/components/Sidebar.tsx:375-383`); Health/Logs/Toast repiten tonos genericos (`src/components/settings/HealthPanel.tsx:84-94`, `src/components/settings/LogsPanel.tsx:196-198`, `src/components/ToastHost.tsx:54-56`).
- Inputs con `focus:outline-none` dependen de borde/color y pueden perder foco visible: Chat, CommandPalette, Twitter, Notas (`src/components/ChatView.tsx:354-363`, `src/components/CommandPalette.tsx:186-193`, `src/components/TwitterView.tsx:319-325`, `src/components/notas/NotasView.tsx:110`).
- Touch targets chicos: boton de contraer sidebar usa `p-1` con icono 14 (`src/components/Sidebar.tsx:308-314`).

**Riesgos**

- Drift visual hacia dashboard generico; foco/touch target pueden fallar accesibilidad.

**Recomendaciones**

- Componente de chip/status con `data-tone`; utility input con focus-ring canonico; aplicar `.touch-target` en icon buttons mobile.

## 9. Estado del cliente

**Hallazgos**

- QueryClient tiene defaults razonables para cold starts (`src/state/queryClient.ts:3-14`), pero `queryKeys` solo lista una parte del dominio (`src/state/queryClient.ts:16-27`).
- Optimistic updates existen en entities/quotes/relationships (`src/state/useEntities.ts:126-162`, `src/state/useQuotes.ts:130-162`, `src/state/useRelationships.ts:98-131`).
- Bug: `debounceTimer` en `useUpdateEntityPosition` es variable local del hook y se reinicia en cada render (`src/state/useEntities.ts:166-190`).
- Momentos/Notas invalidan sin optimistic/rollback (`src/state/useMomentos.ts:31-76`, `src/state/useNotes.ts:20-48`).
- Chat streaming no bloquea sends concurrentes; refs `userIdRef/assistantIdRef` se pisan si hay dos envios solapados (`src/state/useChat.ts:76-145`).
- Cliente lee token desde `window.__clerk` en vez de hook tipado (`src/api/request.ts:164-188`).

**Riesgos**

- Spam de updates de posicion, estado viejo en dominios derivados, races de chat y fragilidad con upgrades de Clerk.

**Recomendaciones**

- `useRef` para debounce; centralizar query keys; invalidar cronologia/atlas tras mutations relevantes; guard `if (pending) return` o cola por thread en chat; migrar a `useApiClient()` con `useAuth()`.

## 10. Testing y calidad

**Hallazgos**

- Hay 159 archivos de test (`rg --files -g '*.test.*'`), y CI corre typecheck, vitest, coverage y build (`.github/workflows/test.yml:42-83`).
- Migrations job aplica 39 migraciones en Postgres pgvector y verifica idempotencia (`.github/workflows/test.yml:134-192`).
- Isolation tests existen para auth y varios dominios (`netlify/functions/_lib/auth.test.ts:50-128`, `netlify/functions/_lib/isolation.test.ts:1-119`, `netlify/functions/_lib/isolation-quotes.test.ts:1-102`).
- Gaps verificados: `ask.mts`, `atlas.mts`, `cronicas.mts`, `suggest-relationships.mts` tienen logica handler critica y no se ve `*-endpoint.test.ts` dedicado por nombre; `suggest-relationships` no usa Zod (`netlify/functions/suggest-relationships.mts:42-49`).

**Riesgos**

- Tests pueden cubrir helpers pero no leaks de endpoint como chat; e2e mockeado no detecta SQL/ownership real.

**Recomendaciones**

- Extraer endpoints AI criticos a unidades testeables; tests de aislamiento por endpoint con dos users; integracion SQL minima contra servicio Postgres del job migrations.

## 11. CI/CD y operaciones

**Hallazgos**

- CI es fuerte y paralelo: lint/format, unit, e2e, secrets, migrations (`.github/workflows/test.yml:23-192`).
- `npm audit` esta `continue-on-error: true`, aunque el comentario dice que falla solo critical (`.github/workflows/test.yml:85-89`).
- Netlify build usa `npm run build` y headers CDN en `netlify.toml` (`netlify.toml:1-49`).
- Deploy docs dicen solo typecheck/tests/build y que `netlify.toml` no existe (`docs/deploy.md:16-24`, `docs/deploy.md:76-79`), contradiciendo workflow/netlify.
- `.env.example` usa `NETLIFY_DATABASE_URL` y omite Clerk/fallback (`.env.example:4`, `README.md:282`).

**Riesgos**

- Onboarding local falla; runbook de incidente envia al operador a supuestos falsos; audit warn-only puede ocultar vulnerabilidad critical si no se revisa.

**Recomendaciones**

- Corregir `.env.example`, `docs/deploy.md`, README scripts; decidir si `npm audit` debe fallar de verdad o documentar warn-only.

## 12. Documentacion y onboarding

**Hallazgos**

- `AGENTS.md` y `CLAUDE.md` contienen las reglas absolutas y estan alineados (`AGENTS.md:1-63`, `CLAUDE.md:1-63`).
- Drift: `docs/README.md` dice "Hoy es single-user por diseno" mientras roadmap dice Clerk activo con faltantes concretos (`docs/README.md:15`, `docs/conventions/roadmap.md:6`).
- README documenta `npm run test:e2e`, pero script real es `e2e` (`README.md:253`, `package.json:15-16`).
- `docs/conventions/llm.md` habla de tres funciones publicas, pero barrel exporta cinco (`docs/conventions/llm.md:5-17`, `netlify/functions/_lib/llm.ts:10-16`).
- `docs/conventions/data.md` lista hooks incompleta frente a 36 archivos en `src/state/` (`docs/conventions/data.md:20-33`, inventario `find src/state`).

**Riesgos**

- Un humano/agente nuevo va a copiar comandos/env vars incorrectas y puede tocar zonas nuevas sin canon de dominio.

**Recomendaciones**

- Actualizar docs con conteos vivos o eliminar conteos; agregar dominios Atlas/Cronologia/Cronicas/Notas/Tasks/X; colapsar AGENTS/CLAUDE a fuente unica o proceso de sync.

## 13. Deuda tecnica priorizada

**Hallazgos**

- Multi-user incompleto es la deuda principal: roadmap enumera provisioning, cierre fallback, tests de aislamiento, Spotify/cost-cap por persona (`docs/conventions/roadmap.md:6`).
- `ALLOW_LEGACY_FALLBACK` puede mapear requests sin token a `legacy-single-user` (`netlify/functions/_lib/auth.ts:92-99`).
- Entities DELETE no cascadea a Momentos/Notas (`netlify/functions/entities.mts:289-298`).
- Componentes y archivos grandes siguen concentrando orquestacion: `HomeView` descarga multiples dominios (`src/components/HomeView.tsx:49-79`), `RelationshipsView` mezcla form, virtualizacion y AI suggestions (`src/components/RelationshipsView.tsx:24-90`).

**Riesgos**

- Abrir a familia/terceros antes de cerrar fallback y ownership crea fuga de datos; borrar entidades deja referencias visibles o huerfanas.

**Recomendaciones**

- Sprint de deuda sin features: aislamiento chat/foreign IDs, provisioning/upsert, fallback off, cascade soft-delete, tests.

## 14. Top oportunidades

1. **P0 - Aislamiento chat**: filtrar/insertar con `user_id` en chat y ask (`netlify/functions/chat-messages.mts:45-51`, `netlify/functions/ask.mts:252-286`). Impacto seguridad. Esfuerzo S.
2. **P0 - Ownership de foreign IDs**: validar `entity_id`, `from_id`, `to_id`, `entity_ids` antes de insertar (`netlify/functions/quotes.mts:136-138`, `netlify/functions/relationships.mts:116-126`, `netlify/functions/momentos.mts:242-248`). Impacto seguridad/correctness. Esfuerzo S.
3. **P0 - Cost-cap en Atlas/Cronicas**: agregar `checkMonthlyBudget` y `extraction_log` (`netlify/functions/atlas.mts:219-225`, `netlify/functions/cronicas.mts:210-217`). Impacto costos. Esfuerzo S.
4. **P1 - Re-embed real**: comparar valores pre/post en entities/quotes (`netlify/functions/entities.mts:250-284`, `netlify/functions/quotes.mts:221-255`). Impacto costos. Esfuerzo S.
5. **P1 - SSRF url-preview**: bloquear IPs privadas antes de `fetch` (`netlify/functions/momentos-url-preview.mts:58-95`). Impacto seguridad. Esfuerzo S.
6. **P1 - Corregir docs/env**: `.env.example`, deploy, README scripts, conteos (`.env.example:4`, `docs/deploy.md:78`, `README.md:253`). Impacto onboarding. Esfuerzo S.
7. **P1 - Graph/Home escala**: `Set` para vecinos y `/api/home` liviano (`src/components/graph/GraphSvgCanvas.tsx:178-190`, `src/components/HomeView.tsx:49-52`). Impacto perf. Esfuerzo M.
8. **P1 - Estado cliente**: `useRef` debounce, queryKeys completas, invalidaciones cruzadas (`src/state/useEntities.ts:166-190`, `src/state/queryClient.ts:16-27`). Impacto UX/correctness. Esfuerzo S/M.
9. **P2 - Diseno/accessibility sweep**: chips semanticos, focus rings, touch targets (`src/components/Sidebar.tsx:257-266`, `src/components/ChatView.tsx:354-363`, `src/components/Sidebar.tsx:308-314`). Impacto UX. Esfuerzo M.
10. **P2 - Modularizar embeddings/LLM**: mover fetch embeddings bajo abstraccion o documentar excepcion (`netlify/functions/_lib/embeddings.ts:112-127`). Impacto mantenibilidad/costos. Esfuerzo S.

## Backlog priorizado

| Prioridad | Item                                                              | Dimension | Evidencia                                                                                                                         | Impacto                    | Esfuerzo |
| --------- | ----------------------------------------------------------------- | --------: | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------- |
| P0        | Filtrar/insertar chat por `user_id`                               |         4 | `netlify/functions/chat-messages.mts:45-51`, `netlify/functions/ask.mts:71-78`                                                    | Seguridad multi-user       | S        |
| P0        | Validar ownership de foreign IDs en quotes/relationships/momentos |         4 | `netlify/functions/quotes.mts:136-138`, `netlify/functions/relationships.mts:116-126`, `netlify/functions/momentos.mts:242-248`   | Seguridad/correctness      | S        |
| P0        | `checkMonthlyBudget` + `extraction_log` en Atlas/Cronicas         |         5 | `netlify/functions/atlas.mts:219-225`, `netlify/functions/cronicas.mts:210-217`                                                   | Costo/observabilidad       | S        |
| P0        | Provisioning/upsert de usuarios y cierre planificado de fallback  |        13 | `docs/conventions/roadmap.md:6`, `netlify/functions/_lib/auth.ts:92-99`                                                           | Bloquea multi-user         | M        |
| P1        | Re-embed solo si texto cambia realmente                           |         5 | `netlify/functions/entities.mts:250-284`, `netlify/functions/quotes.mts:221-255`                                                  | Costo                      | S        |
| P1        | Bloquear SSRF en url-preview                                      |         6 | `netlify/functions/momentos-url-preview.mts:58-95`                                                                                | Seguridad                  | S        |
| P1        | FK `user_id -> users(id)` en tablas recientes                     |         3 | `20260528130000_cronicas`, `20260528150000_atlas`, `20260529000000_notes`, `20260529140000_tasks`, `20260530130000_x_integration` | Integridad                 | M        |
| P1        | Corregir defaults/doc de AI cap y status                          |         5 | `netlify/functions/_lib/cost-cap.ts:32-37`, `docs/ai.md:88-93`                                                                    | Operacion/costos           | S        |
| P1        | Fix debounce posicion con `useRef`                                |         9 | `src/state/useEntities.ts:166-190`                                                                                                | Performance backend        | S        |
| P1        | Memoizar vecinos seleccionados en GraphSvgCanvas                  |         7 | `src/components/graph/GraphSvgCanvas.tsx:178-190`                                                                                 | Performance UI             | S        |
| P1        | Endpoint home liviano                                             |         7 | `src/components/HomeView.tsx:49-52`                                                                                               | Performance escala         | M        |
| P1        | Actualizar docs/env/scripts                                       |     11/12 | `.env.example:4`, `docs/deploy.md:78`, `README.md:253`                                                                            | Onboarding                 | S        |
| P2        | Migrar `aiOffResponse` a `ApiErrors.aiDisabled`                   |       2/4 | `netlify/functions/_lib/ai-mode.ts:104-107`                                                                                       | Contrato API               | S        |
| P2        | Zod en `suggest-relationships` body                               |         4 | `netlify/functions/suggest-relationships.mts:42-49`                                                                               | Calidad/contrato           | S        |
| P2        | Consolidar chips/status/focus/touch target                        |         8 | `src/components/Sidebar.tsx:257-266`, `src/components/ChatView.tsx:354-363`                                                       | Accesibilidad/consistencia | M        |
| P2        | `useApiClient()` con `useAuth()` de Clerk                         |      9/13 | `src/api/request.ts:164-188`                                                                                                      | Mantenibilidad auth        | M        |
| P2        | Mover/documentar embeddings dentro de abstraccion LLM             |      2/14 | `netlify/functions/_lib/embeddings.ts:112-127`                                                                                    | Mantenibilidad             | S        |

## Zonas no auditadas

- No se corrio runtime local, build, tests, e2e, axe, bundle report ni EXPLAIN.
- No se revisaron linea por linea las 65 functions ni las 39 migraciones; se cubrieron hot paths y migraciones representativas.
- No se verifico configuracion real de Netlify/GitHub (env vars, branch protection, deploy previews, logs historicos).
- No se midieron latencias/cold starts/cache hit rate reales.
