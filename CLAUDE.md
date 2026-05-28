# Convenciones para sesiones de Claude Code en Trama

Este archivo lo lee Claude automáticamente al entrar al proyecto. Acá viven solo **las reglas que no se pueden romper** y un **índice** a los documentos detallados. Lo específico (design tokens, LLM, dominios, etc.) se splitteó en `docs/conventions/*` en G1.

## Reglas fundamentales

- **Migraciones SQL son inmutables después de aplicadas.** Si necesitás cambiar el esquema, creá una migración NUEVA en `netlify/database/migrations/<timestamp>_<slug>/migration.sql`. NUNCA edites una que ya está en `main`. Netlify rechaza el deploy si una migración previamente registrada cambió de hash.

- **`origin` es JSONB, no string.** En SQL es `JSONB NOT NULL DEFAULT '{"kind":"manual"}'`. En TS es `Origin = { kind, provider?, model?, extractionLogId?, importedFrom? }`. Si ves `entity.origin === 'ai'` en algún lado, es código viejo — corrige a `entity.origin.kind === 'ai'`.

- **Soft delete, no hard delete.** Las queries SIEMPRE incluyen `WHERE deleted_at IS NULL`. El endpoint DELETE hace `UPDATE SET deleted_at = NOW()`, nunca `DELETE FROM`. Si una entidad se borra, cascadea soft-delete a sus relaciones y citas (tres UPDATE en el handler). Las únicas tablas exentas son las append-only (`chat_messages`, `spotify_plays`) — caen por CASCADE de su parent.

- **snake_case en SQL, camelCase en TS.** Los transforms están en `src/api/` (cliente) y en cada `*.mts` function (servidor). La frontera está marcada — no quotear identificadores en SQL ni nombrar variables raras en JS.

- **`EntityType` y `RelationshipType` son `string`, no unions cerradas.** La fuente de verdad son las tablas `entity_types` y `relationship_types`. Las constantes en `src/types/entity.ts` y `src/types/relationship.ts` son fallbacks para selects manuales, no autoridad.

- **Tests deben pasar antes de commitear.** `npm test` + `npm run typecheck` + `npm run build`. CI los corre en `.github/workflows/test.yml`. Si rompés algún test crítico (validators, LLM provider dispatch, layout puro, transforms), arreglalo antes de seguir.

## Cosas que NO hagas sin pensarlo dos veces

- **Hard-deletear filas** (rompe `deleted_at` semantics, salvo en tablas append-only).
- **Cambiar el shape de `origin`** (rompe parsers en muchos lugares).
- **Cambiar `kind` de un Momento via PATCH** (ver `docs/conventions/dominios.md`).
- **Llamar a `@netlify/blobs` desde el cliente** (rompe seguridad y modelo de caching — usá los endpoints).
- **Re-embedear en PATCH sin verificar que cambió el texto** (cuesta a OpenAI cada link de entityIds — chequear `shouldReembed`).
- **Saltarse los transforms en `src/api/`** (snake_case llegaría al React state, todo se rompe).
- **Llamar fetch directo a una API de LLM** (rompe abstracción + costos + retry + cache; usá `_lib/llm/`).
- **Llamar `neon()` o leer `NETLIFY_DATABASE_URL` directo** (rompe el patrón `getSql()`; la variable correcta ahora es `NETLIFY_DB_URL`).
- **Editar una migración aplicada** (rompe consistencia entre entornos, Netlify rechaza el deploy).
- **Persistir posiciones de drag fuera del modo orgánico del grafo** (las otras vistas son determinísticas).
- **Agregar un rate limit por IP** (removido a pedido del usuario; el cost-cap mensual es suficiente).
- **Errores de endpoints con `new Response('texto', { status: 4xx })`** — usá `ApiErrors.*` de `_lib/api-error.ts`. Shape canónico `{ error: { code, message, requestId, details? } }`.

## Índice de convenciones (docs/conventions/)

| Doc                                             | Cubre                                                                                               |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [**design.md**](docs/conventions/design.md)     | Type scale, icon sizes, tracking, animaciones, vertical rhythm, accesibilidad, patterns canónicos δ |
| [**data.md**](docs/conventions/data.md)         | `getSql()`, hooks de estado `src/state/`, Netlify Blobs, costos + observabilidad + request-id       |
| [**llm.md**](docs/conventions/llm.md)           | Abstracción `_lib/llm/`, providers, caminos de propuesta IA                                         |
| [**api.md**](docs/conventions/api.md)           | Schemas Zod, patrón de añadir endpoint, ApiErrors canónicos, tipos                                  |
| [**dominios.md**](docs/conventions/dominios.md) | Grafo, Chat, Momentos (ξ) — patrones específicos de cada vista                                      |
| [**roadmap.md**](docs/conventions/roadmap.md)   | Decisiones aplazadas (multi-user, CRDTs, xyflow, etc.)                                              |

## Runbooks operacionales (docs/)

| Doc                            | Cubre                                              |
| ------------------------------ | -------------------------------------------------- |
| `docs/ai.md`                   | LLM providers, caching, fallbacks                  |
| `docs/datos.md`                | Backup, recovery, migraciones                      |
| `docs/deploy.md`               | Netlify setup, env vars, domain                    |
| `docs/escala.md`               | Limits (1k nodos → WebGL, chat RAG context window) |
| `docs/incidentes.md`           | Troubleshooting, métricas críticas                 |
| `docs/migracion-multi-user.md` | Plan futuro (no implementado)                      |
| `docs/migraciones.md`          | Database workflow                                  |

## Cómo agregar contexto nuevo a CLAUDE.md

Si descubrís un pattern, regla o "no toques esto" relevante para futuras sesiones de Claude:

1. **¿Es regla absoluta?** → acá, en "Reglas fundamentales" o "Cosas que NO hagas".
2. **¿Es convención específica de dominio?** → archivo correspondiente en `docs/conventions/`.
3. **¿Es operacional (recovery, deploy, incident)?** → archivo en `docs/`.

El objetivo: que `CLAUDE.md` se mantenga corto (< 100 líneas). Si está creciendo, splitea.
