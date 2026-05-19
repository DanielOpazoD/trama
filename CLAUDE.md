# Convenciones para sesiones de Claude Code en Trama

Este archivo lo lee Claude automáticamente al entrar al proyecto. Documenta las **convenciones específicas** que importan para no romper cosas — el "qué hace el código" se infiere leyéndolo, pero el "por qué" y "no toques esto" vive acá.

## Reglas fundamentales

- **Migraciones SQL son inmutables después de aplicadas.** Si necesitas cambiar el esquema, crea una migración NUEVA en `netlify/database/migrations/<timestamp>_<slug>/migration.sql`. NUNCA edites una que ya está en `main`. Excepción: si aún no se ha deployado, se puede consolidar (poco probable a estas alturas).

- **`origin` es JSONB, no string.** En SQL es `JSONB NOT NULL DEFAULT '{"kind":"manual"}'`. En TS es `Origin = { kind, provider?, model?, extractionLogId?, importedFrom? }`. Si ves `entity.origin === 'ai'` en algún lado, es código viejo — corrige a `entity.origin.kind === 'ai'`.

- **Soft delete, no hard delete.** Las queries SIEMPRE incluyen `WHERE deleted_at IS NULL`. El endpoint DELETE hace `UPDATE SET deleted_at = NOW()`, nunca `DELETE FROM`. Si una entidad se borra, cascadea soft-delete a sus relaciones y citas (tres UPDATE en el handler).

- **snake_case en SQL, camelCase en TS.** Los transforms están en `src/api.ts` (cliente) y en cada `*.mts` function (servidor). La frontera está marcada — no quotear identificadores en SQL ni nombrar variables raras en JS.

- **Tests deben pasar antes de mergear.** `npm test` + `npm run typecheck` + `npm run build`. CI los corre en `.github/workflows/test.yml`. Si rompes algún test crítico (validateExtraction, LLM provider dispatch, transforms), arréglalo antes de seguir.

## Estructura de los hooks de estado

`src/state.tsx` es un **agregador** que expone `useTrama()` sobre TanStack Query. Los hooks granulares viven en `src/state/`:
- `useEntitiesQuery` + mutations
- `useRelationshipsQuery` + mutations
- `useQuotesQuery` + mutations

**No uses `useTrama()` para mutations en código nuevo.** Importa el mutation hook específico (`useAddEntity`, `useDeleteEntity`, etc.). `useTrama()` queda como API legacy para componentes existentes.

## El LLM

Toda llamada a un modelo pasa por `netlify/functions/_lib/llm.ts` → `askLLMForJson(messages)`. Esta función:
- Lee provider y key de env vars (NUNCA hardcodeadas)
- Cachea por hash del input (TTL configurable)
- Hace retry con backoff en 5xx/429, no en 4xx
- Devuelve `{ content, usage, fromCache }` — usage incluye costo estimado

**No llames a APIs de LLM directamente.** Si necesitas un proveedor nuevo, agrégalo en `PROVIDER_DEFAULTS` y la función dispatcher. Nunca hagas `fetch('https://api.openai.com/...')` desde otro archivo.

## El extractor

`netlify/functions/extract.mts` orquesta: lee tipos de la DB, construye prompt, llama LLM, valida respuesta, persiste log.

La lógica pura está aislada en `_lib/`:
- `extract-prompt.ts` — construye los `LLMMessage[]` (acepta `entityTypes` y `relationshipTypes` como args)
- `extract-validate.ts` — pure function que valida y limpia la respuesta del LLM (acepta sets de tipos válidos)

**Para cambiar el prompt:** edita `extract-prompt.ts`. Cualquier cambio significativo merece bump del campo `prompt_version` en `extraction_log` (TODO: agregar) para poder comparar resultados entre versiones.

## Patrón de añadir un nuevo endpoint

1. Crea `netlify/functions/<name>.mts` con default export y `config.path`.
2. Usa `Netlify.env.get('NETLIFY_DATABASE_URL')` y `neon(connectionString)`.
3. Para GET/POST/PATCH/DELETE en el mismo path, branch por `req.method`.
4. Agrega el cliente en `src/api.ts`.
5. Si hay UI, hook en `src/state/` (con TanStack Query).
6. Test al menos la lógica pura (validate, transforms) en `*.test.ts`.

## Patrón de añadir un nuevo tipo (entidad o relación)

Antes (con la lista hardcoded): editar `types.ts` + migración + redeploy.
**Ahora:** insertar fila en `entity_types` o `relationship_types` desde la UI (cuando exista esa UI) o via SQL directo. El extractor y la validación leen los tipos en runtime.

Excepción: la lista `ENTITY_TYPES` y `RELATIONSHIP_TYPES` en `src/types.ts` se usa como **fallback** cuando los componentes UI todavía no migran al hook dinámico. Cuando agregues un tipo nuevo via DB, también considera actualizar este fallback para consistencia visual.

## Cuando edites el grafo

`src/components/GraphView.tsx` es solo composición. La lógica está en:
- `src/hooks/useForceLayout.ts` — simulación Fruchterman-Reingold
- `src/hooks/usePanZoom.ts` — drag, pan, zoom, screenToWorld
- `src/components/graph/GraphNode.tsx`, `GraphEdge.tsx` — render

Si quieres agregar un layout alternativo (radial, jerárquico, etc.), no edites `useForceLayout` — crea un nuevo hook hermano y permite elegirlo desde props.

Si quieres animar entradas/salidas de nodos: actualiza `GraphNode` con CSS transitions sobre las props derivadas de `isFocused`/`isSelected`/`isDimmed`. La transición de opacidad ya está.

## Costos y observabilidad

Cada extracción se loguea en `extraction_log` con tokens y costo estimado. Para ver el dashboard manualmente:

```sql
SELECT
  COUNT(*) AS calls,
  SUM(cost_cents) AS total_cost_cents,
  SUM(tokens_in + tokens_out) AS total_tokens
FROM extraction_log
WHERE created_at > NOW() - INTERVAL '30 days';
```

(El endpoint `/api/extraction-log` lo expone para una UI futura.)

## Cosas que NO hagas sin pensarlo dos veces

- Hard-deletear filas (rompe `deleted_at` semantics).
- Cambiar el shape de `origin` (rompe parsers en muchos lugares).
- Saltarse los transforms en `api.ts` (snake_case llegará al React state, todo se rompe).
- Llamar fetch directo a una API de LLM (rompe abstracción + costos + retry).
- Editar una migración aplicada (rompe consistencia entre entornos).

## Decisiones aplazadas (no urgentes, no implementadas)

Documentadas para no re-litigar:

- **Local-first sync con CRDTs (Yjs/Automerge).** Vale la pena cuando se use en 2+ dispositivos en simultáneo. Hoy localStorage es solo fallback unidireccional.
- **Auth real (Netlify Identity).** Hoy se protege con site password. Si el alcance crece más allá de uso personal, considerar.
- **Migrar grafo a xyflow o sigma.js.** El layout casero escala bien hasta ~150 nodos. Más allá, considerar.
- **UI de gestión de tipos.** Las tablas existen, los endpoints existen. Falta el formulario.
- **UI del extraction log.** El endpoint existe. Falta la vista.
- **Tests de componentes UI con React Testing Library.** El scaffold de Vitest está; agregar jsdom y `@testing-library/react` cuando se quiera cubrir UI.
