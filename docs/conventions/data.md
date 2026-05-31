# Data layer — DB, hooks de estado, Blobs, observabilidad

## La conexión a la DB

`netlify/functions/_lib/db.ts` exporta `getSql()`. Eso es lo único que importás en una function:

```ts
import { getSql } from './_lib/db.js'

export default withObservability('my-endpoint', async (req, _ctx, { requestId }) => {
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

## Netlify Blobs (storage no-DB)

Trama agregó Netlify Blobs en ξ3 como capa de blob storage para fotos. Antes de ξ todo vivía en Neon Postgres (texto). El stack ahora es **dos persistencias**: Postgres para datos estructurados + Blobs para binarios.

```ts
import { getStore } from '@netlify/blobs'
const store = getStore('momentos-media') // store name = namespace
await store.set(key, arrayBuffer, { metadata: { mime: '...' } })
const blob = await store.getWithMetadata(key, { type: 'arrayBuffer' })
```

**Convenciones:**

- Una store por dominio (`momentos-media` hoy; si surge otro caso, store nueva).
- Keys nuevas son `${userId}/${hash}.${ext}`. Las legacy sin slash pertenecen
  al usuario `legacy-single-user`. Todas son inmutables.
- Mime y tamaño en `metadata`. Strip EXIF NO se hace (defer hasta que importe — el endpoint que sirve no expone metadata extra).
- El cliente NUNCA llama a Netlify Blobs directo. Siempre via los endpoints
  `/api/momentos-upload`, `/api/momentos-audio-upload` y
  `/api/momentos-file/:key`.

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

Errores de cualquier function se persisten en `error_log` vía `persistError()` en `_lib/observability.ts`. Cada fila incluye `request_id` (FF1) que linkea al header `x-request-id` que vio el cliente — un reporte de usuario es trazable a la fila exacta del log con una query. El endpoint `/api/error-log` los expone (también para futura UI).

`AI_MONTHLY_BUDGET_CENTS` corta llamadas al LLM cuando se alcanza el cap mensual. Es la única protección de gasto que queda (no hay rate limit por IP — fue removido conscientemente).
