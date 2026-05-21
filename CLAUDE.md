# Convenciones para sesiones de Claude Code en Trama

Este archivo lo lee Claude automáticamente al entrar al proyecto. Documenta las **convenciones específicas** que importan para no romper cosas — el "qué hace el código" se infiere leyéndolo, pero el "por qué" y "no toques esto" vive acá.

## Reglas fundamentales

- **Migraciones SQL son inmutables después de aplicadas.** Si necesitas cambiar el esquema, crea una migración NUEVA en `netlify/database/migrations/<timestamp>_<slug>/migration.sql`. NUNCA edites una que ya está en `main`. Netlify rechaza el deploy si una migración previamente registrada cambió de hash.

- **`origin` es JSONB, no string.** En SQL es `JSONB NOT NULL DEFAULT '{"kind":"manual"}'`. En TS es `Origin = { kind, provider?, model?, extractionLogId?, importedFrom? }`. Si ves `entity.origin === 'ai'` en algún lado, es código viejo — corrige a `entity.origin.kind === 'ai'`.

- **Soft delete, no hard delete.** Las queries SIEMPRE incluyen `WHERE deleted_at IS NULL`. El endpoint DELETE hace `UPDATE SET deleted_at = NOW()`, nunca `DELETE FROM`. Si una entidad se borra, cascadea soft-delete a sus relaciones y citas (tres UPDATE en el handler). Las únicas tablas exentas son las append-only (`chat_messages`, `spotify_plays`) — caen por CASCADE de su parent.

- **snake_case en SQL, camelCase en TS.** Los transforms están en `src/api.ts` (cliente) y en cada `*.mts` function (servidor). La frontera está marcada — no quotear identificadores en SQL ni nombrar variables raras en JS.

- **`EntityType` y `RelationshipType` son `string`, no unions cerradas.** La fuente de verdad son las tablas `entity_types` y `relationship_types`. Las constantes en `src/types.ts` son fallbacks para selects manuales, no autoridad. Cuando agregues un tipo nuevo via migración, actualiza el fallback para consistencia visual, pero no necesitas tocar la lógica.

- **Tests deben pasar antes de commitear.** `npm test` + `npm run typecheck` + `npm run build`. CI los corre en `.github/workflows/test.yml`. Si rompes algún test crítico (validators, LLM provider dispatch, layout puro, transforms), arréglalo antes de seguir.

## La conexión a la DB

`netlify/functions/_lib/db.ts` exporta `getSql()`. Eso es lo único que importás en una function:

```ts
import { getSql } from './_lib/db.js'

export default withObservability('my-endpoint', async (req) => {
  const sql = getSql()
  const rows = await sql`SELECT 1`
  ...
})
```

`getSql()` resuelve la conexión vía `@netlify/database` (que lee `NETLIFY_DB_URL`). **No leas `NETLIFY_DATABASE_URL` ni instancies `neon()` directamente** — esa era la integración heredada (`@netlify/neon`), retirada por Netlify. Si ves código viejo que lo hace, migrar al patrón nuevo.

## Estructura de los hooks de estado

`src/state/` exporta hooks granulares. Cada vista importa exactamente los que necesita:

- `useEntitiesQuery`, `useAddEntity`, `useUpdateEntity`, `useUpdateEntityPosition`, `useUpdateEntityType`, `useDeleteEntity`
- `useRelationshipsQuery`, `useAddRelationship`, `useDeleteRelationship`
- `useQuotesQuery`, `useAddQuote`, `useDeleteQuote`
- `useExtract`, `useSuggestRelationships`, `useReclassifyEntities`
- `useChatThreadsQuery`, `useCreateChatThread`, `useDeleteChatThread`, `useChatMessagesQuery`, `useSendChatMessage`
- `useExport`, `useImport`
- `useOffline`

`src/state.tsx` solo exporta el `Provider` de TanStack Query. No hay agregador `useTrama()` ya.

## El LLM

Toda llamada a un modelo pasa por `netlify/functions/_lib/llm.ts`. Tres funciones:

- `askLLMForJson(messages)` — fuerza `response_format: json_object`. Para extract/suggest/reclassify.
- `askLLMForText(messages)` — texto plano (no streaming). Para el auto-título de threads y como fallback en Anthropic/Gemini.
- `askLLMForTextStreaming(messages)` — async generator de `{chunk|done|error}` frames. SSE real en DeepSeek/OpenAI; fallback de un único chunk en Anthropic/Gemini.

Las tres:
- Leen provider y key de env vars (NUNCA hardcodeadas)
- Cachean por hash del input (TTL configurable)
- Hacen retry con backoff en 5xx/429, no en 4xx
- Devuelven `{ content, usage, fromCache }` — usage incluye costo estimado

**No llames a APIs de LLM directamente.** Si necesitas un proveedor nuevo, agrégalo en `PROVIDER_DEFAULTS` y en cada función dispatcher. Nunca hagas `fetch('https://api.openai.com/...')` desde otro archivo.

## Los cuatro caminos de propuesta IA

Cinco endpoints terminan en propuestas estructuradas que la UI muestra para aprobar:

| Endpoint | Prompt | Validator |
|---|---|---|
| `/api/extract` | `_lib/extract-prompt.ts` | `_lib/extract-validate.ts` |
| `/api/suggest-relationships` | `_lib/suggest-relationships-prompt.ts` | reusa `extract-validate` con `validEntityTypes` vacío |
| `/api/reclassify-entities` | `_lib/reclassify-prompt.ts` | `_lib/reclassify-validate.ts` |
| `/api/chat/threads/:id/messages` | `_lib/chat-prompt.ts` (system + history) | `_lib/chat-validate.ts` (extrae JSON entre markers `<<<TRAMA-PROPOSAL ... TRAMA-PROPOSAL>>>`) |
| `/api/spotify/import-playlist` | (no LLM — parse y fetch determinístico) | filtra en el endpoint |

Cuando agregues un camino nuevo, sigue el patrón: prompt aislado, validator puro, endpoint que orquesta. Loguea el resultado en `extraction_log` para que el dashboard de costos lo capture.

## Patrón de añadir un nuevo endpoint

1. Crea `netlify/functions/<name>.mts` con default export y `config.path`.
2. Importa `getSql` desde `./_lib/db.js`; instánciala dentro del handler.
3. Wrap el handler con `withObservability('<name>', ...)` para que errores se logueen en `error_log`.
4. Para GET/POST/PATCH/DELETE en el mismo path, branch por `req.method`.
5. Agrega el cliente en `src/api.ts`.
6. Si hay UI, hook en `src/state/` (con TanStack Query).
7. Test al menos la lógica pura (prompts, validators, transforms) en `*.test.ts`.

## Patrón de añadir un nuevo tipo (entidad o relación)

**Vía migración nueva.** Insertás en `entity_types` o `relationship_types` con `ON CONFLICT (slug) DO NOTHING` para idempotencia. El extractor, suggest, reclassify y chat leen los tipos en runtime — ningún código React hace falta cambiar.

Considera actualizar el fallback en `src/types.ts` (`ENTITY_TYPES`, `RELATIONSHIP_TYPES`) y en `GraphNode.tsx` (`TYPE_ACCENT`) para que el select manual y el color del nodo reflejen el tipo nuevo. Estos son fallbacks visuales, no autoridad.

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

## Costos y observabilidad

Cada llamada al LLM (extract, suggest, reclassify, chat) se loguea en `extraction_log` con tokens y costo estimado. Para ver el dashboard manualmente:

```sql
SELECT
  COUNT(*) AS calls,
  SUM(cost_cents) AS total_cost_cents,
  SUM(tokens_in + tokens_out) AS total_tokens
FROM extraction_log
WHERE created_at > NOW() - INTERVAL '30 days';
```

El endpoint `/api/extraction-log` lo expone para una UI futura.

Errores de cualquier function se persisten en `error_log` vía `persistError()` en `_lib/observability.ts`. El endpoint `/api/error-log` los expone (también para futura UI).

`AI_MONTHLY_BUDGET_CENTS` corta llamadas al LLM cuando se alcanza el cap mensual. Es la única protección de gasto que queda (no hay rate limit por IP — fue removido conscientemente).

## Cosas que NO hagas sin pensarlo dos veces

- **Hard-deletear filas** (rompe `deleted_at` semantics, salvo en tablas append-only).
- **Cambiar el shape de `origin`** (rompe parsers en muchos lugares).
- **Saltarse los transforms en `api.ts`** (snake_case llegará al React state, todo se rompe).
- **Llamar fetch directo a una API de LLM** (rompe abstracción + costos + retry + cache).
- **Llamar `neon()` o leer `NETLIFY_DATABASE_URL` directo** (rompe el patrón `getSql()`; la variable correcta ahora es `NETLIFY_DB_URL` y la maneja el wrapper).
- **Editar una migración aplicada** (rompe consistencia entre entornos, Netlify rechaza el deploy).
- **Persistir posiciones de drag fuera del modo orgánico** (las otras vistas son determinísticas, contaminarías el cache).
- **Agregar un rate limit por IP** (fue removido a pedido del usuario; el cost-cap mensual es suficiente).

## Decisiones aplazadas (no urgentes, no implementadas)

Documentadas para no re-litigar:

- **Local-first sync con CRDTs (Yjs/Automerge).** Vale la pena cuando se use en 2+ dispositivos en simultáneo. Hoy localStorage es solo fallback unidireccional.
- **Auth real (Netlify Identity).** Hoy se protege con site password. Si el alcance crece más allá de uso personal, considerar.
- **Migrar grafo a xyflow o sigma.js.** El layout casero escala bien hasta ~150 nodos. Más allá, considerar.
- **UI de gestión de tipos.** Las tablas existen, los endpoints existen. Falta el formulario.
- **UI del extraction log y error log.** Los endpoints existen. Faltan las vistas.
- **Tests de componentes UI con React Testing Library.** El scaffold de Vitest está; agregar `@testing-library/react` cuando se quiera cubrir UI.
- **Streaming nativo en Anthropic y Gemini.** Hoy `askLLMForTextStreaming` cae a un único chunk en esos providers. Implementarlo cuando se use uno de ellos en producción.
- **Búsqueda dentro de hilos de chat.** Los mensajes están en DB con índice por thread, pero no hay endpoint de search en el contenido. Trivial de agregar cuando haga falta.
