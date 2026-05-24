# Convenciones para sesiones de Claude Code en Trama

Este archivo lo lee Claude automáticamente al entrar al proyecto. Documenta las **convenciones específicas** que importan para no romper cosas — el "qué hace el código" se infiere leyéndolo, pero el "por qué" y "no toques esto" vive acá.

## Reglas fundamentales

- **Migraciones SQL son inmutables después de aplicadas.** Si necesitas cambiar el esquema, crea una migración NUEVA en `netlify/database/migrations/<timestamp>_<slug>/migration.sql`. NUNCA edites una que ya está en `main`. Netlify rechaza el deploy si una migración previamente registrada cambió de hash.

- **`origin` es JSONB, no string.** En SQL es `JSONB NOT NULL DEFAULT '{"kind":"manual"}'`. En TS es `Origin = { kind, provider?, model?, extractionLogId?, importedFrom? }`. Si ves `entity.origin === 'ai'` en algún lado, es código viejo — corrige a `entity.origin.kind === 'ai'`.

- **Soft delete, no hard delete.** Las queries SIEMPRE incluyen `WHERE deleted_at IS NULL`. El endpoint DELETE hace `UPDATE SET deleted_at = NOW()`, nunca `DELETE FROM`. Si una entidad se borra, cascadea soft-delete a sus relaciones y citas (tres UPDATE en el handler). Las únicas tablas exentas son las append-only (`chat_messages`, `spotify_plays`) — caen por CASCADE de su parent.

- **snake_case en SQL, camelCase en TS.** Los transforms están en `src/api.ts` (cliente) y en cada `*.mts` function (servidor). La frontera está marcada — no quotear identificadores en SQL ni nombrar variables raras en JS.

- **`EntityType` y `RelationshipType` son `string`, no unions cerradas.** La fuente de verdad son las tablas `entity_types` y `relationship_types`. Las constantes en `src/types.ts` son fallbacks para selects manuales, no autoridad. Cuando agregues un tipo nuevo via migración, actualiza el fallback para consistencia visual, pero no necesitas tocar la lógica.

- **Tests deben pasar antes de commitear.** `npm test` + `npm run typecheck` + `npm run build`. CI los corre en `.github/workflows/test.yml`. Si rompes algún test crítico (validators, LLM provider dispatch, layout puro, transforms), arréglalo antes de seguir.

## Design tokens (escalas canónicas)

El sistema visual usa tokens semánticos definidos en `tailwind.config.js`. **NO uses arbitrary values (`text-[Npx]`, `tracking-[Xem]`) — significa que el sistema ya tiene un nombre para eso.**

**Type scale — 6 niveles:**
| Token | Tamaño | Para qué |
|---|---|---|
| `text-micro` | 10px | chips, badges, eyebrows uppercase, kbd |
| `text-caption` | 12px | labels, metadata, dates |
| `text-body` | 14px | default UI |
| `text-lead` | 16px | primer párrafo, intros |
| `text-h2` | 20px | títulos de sección |
| `text-h1` | 32px | títulos de vista |
| Legacy aliases `text-xs/sm/base/lg/xl/2xl/3xl/4xl` siguen existiendo pero el código nuevo debe usar los semánticos. |

**Icon sizes — 5 valores:**
| Valor | Para qué |
|---|---|
| `size={10}` | indicadores inline, chips de aviso (• IA, • offline) |
| `size={12}` | default UI, toolbar |
| `size={14}` | botones medianos, nav icons |
| `size={18}` | CTAs primarios, hero |
| `size={22}` | logo Trama, splash |

**Letter spacing — 5 valores:**
| Token | Valor | Para qué |
|---|---|---|
| `tracking-tight` | -0.02em | serif headings compactos |
| `tracking-normal` | 0 | body (default) |
| `tracking-wider` | 0.05em (Tailwind) | uppercase sutil en metadata |
| `tracking-eyebrow` | 0.18em | chips, eyebrows uppercase emphatic |
| `tracking-shout` | 0.3em | greetings, separator labels |

**Animaciones — 6 canónicas:** `animate-fade-up`, `animate-slide-in-right`, `animate-slide-up`, `animate-shimmer`, `animate-pulse-subtle`, `animate-node-breathe`. Todas usan `cubic-bezier(0.25, 1, 0.5, 1)` ("ease-out-quart") salvo `node-breathe` que es `ease-in-out` (pulso simétrico). Si querés otra animación, primero pensá si una de estas no resuelve.

**Vertical rhythm — 8 steps (commit δ1):**
| Token | Valor | Para qué |
|---|---|---|
| `--space-1` | 5.5px | ajustes finos |
| `--space-2` | 11px | separación entre líneas de metadata |
| `--space-3` | 16.5px | padding interno de card / form |
| `--space-4` | 22px | rhythm-unit base |
| `--space-5` | 33px | padding generoso de section header |
| `--space-6` | 44px | separación entre secciones grandes |
| `--space-8` | 66px | padding hero / portada editorial |
| `--space-12` | 99px | espacio de ornament / pull-quote breathing |

Utilities Tailwind que consumen estos tokens:
- `.stack-N` → margin-top entre hijos directos (= space-y-N en el sistema)
- `.pad-block-N` → padding-block

Usar SOLO para spacing vertical en headers de vista, padding de cards, separación entre secciones grandes. El horizontal sigue con la escala de Tailwind (px-N, gap-N).

## Accesibilidad (estado actual)

- `lang="es"` en `<html>`
- Semantic HTML: `<main>`, `<aside>`, `<nav>`, `<header>`, `<footer>` usados consistentemente
- Jerarquía de headings: un solo `<h1>` por pantalla (vive en TopBar; el wordmark "Trama" del Sidebar es `<span>` decorativo)
- `aria-label` en 48+ icon buttons; `aria-describedby` automático en `<Tooltip>`
- `role="alert"` en ErrorBoundary fallback y banners de error
- `role="status"` en ToastHost (`aria-live="polite"`)
- `role="tooltip"` en `<Tooltip>` con id linkeado al trigger
- `:focus-visible` global con outline azul (no se recorta por overflow:hidden)
- `prefers-reduced-motion` respetado en shimmer del skeleton

**Texto vs contraste**: `text-ink-300` (#63636b) es el muted más claro permitido para texto legible — pasa AA con ~5.1:1 sobre `paper-50` blanco, incluso en `text-micro` (10px) que requiere 4.5:1 por ser texto pequeño. Era #71717a hasta ε5 (axe lo cazó en 4.43, justo bajo el umbral). `text-ink-200` (#d4d4d8) NO se usa para texto, solo para iconos decorativos, separators (·), o disabled states.

**Pendiente para futuro audit** con axe-core en CI: color contrast de chips de tipos sobre fondo de card (algunos `typeAccent` claros podrían fallar), touch target sizes en mobile (algunos icon buttons son <44px).

**Trampa común: `label-content-name-mismatch`** — si un botón tiene visible text "Entidades 63" Y un `aria-label`, el aria-label DEBE contener literalmente ese texto (axe-core compara substring case-insensitive post-normalize). `aria-label="Entidades (63)"` falla por los paréntesis; `aria-label="Entidades 63"` pasa. Cuando agregues `aria-label` a un botón con texto visible, hacelos coincidir literalmente — o mejor, omití el aria-label y dejá que el text content lo nombre. Lección de γ4 + δ8.

## Patterns canónicos δ (motion + life)

Después del sprint δ varias técnicas pasaron a ser el patrón estándar para sus casos. Cuando agregues algo similar, usá estos en vez de reinventar.

**NumberTicker (`src/components/NumberTicker.tsx`)** — para mostrar cualquier count que pueda cambiar (sidebar nav counts, totales). Anima dígito por dígito en ~420ms con out-quart, respeta `prefers-reduced-motion`. Es siempre `<span class="tabular-nums">`, así que se puede usar inline en oraciones. NO usar para timestamps ni valores que cambien continuamente — fue pensado para deltas humanos (+1, +10, +100), no para ticking de relojes.

**`useAchievements({ entities, quotes, relationships })`** — corre en App.tsx con los counts de las queries. Dispara un toast efímero cuando se cruza un umbral (10, 25, 50, 100, 250, 500, 1000+). Persiste lo que ya fue notificado en localStorage `trama:achievements-seen`. Si cruzás varios umbrales a la vez (e.g. import masivo) muestra solo el mayor. Si querés agregar un dominio nuevo (e.g. `chatMessages`), extendé la signature y agregá un branch en `pickMessage`.

**`useHiloOfTheDay(entities, quotes)` + `readHiloOfTheDay()`** — compute corre en HomeView con la data, escribe en localStorage `trama:hilo-date` + `trama:hilo-text` una vez por día. Read es la función pura que el Splash importa para mostrar la frase personalizada en vez del aforismo random. Detecta aniversarios (mismo MM-DD, al menos 1 año atrás). Si no hay aniversario hoy, limpia la cache → splash vuelve a aforismo random. **Importante:** el splash NO puede computar esto in-line porque corre antes que las queries terminen — el split entre compute y read es deliberado.

**`useTimeOfDayAccent()`** — corre en App.tsx, muta `--accent-gold` y `--accent-gold-soft` en `<html>` cada 30 min según hora local: cobre cálido en la mañana, dorado al mediodía, ámbar al atardecer, lavanda azulada en la noche. Todo lo que use `var(--accent-gold)` hereda el shift automáticamente. NO crear un hook análogo para otras variables; si necesitás shift de tema, extendé este.

**`ReadingModeEssay`** (`src/components/ReadingModeEssay.tsx`) — modal serif fullscreen para LEER essays largos. Spectral 17px / leading 1.75, max-w-prose, drop-cap si el texto arranca con >= 60 chars, ornamentos arriba/abajo. Atajo Escape cierra. **NO confundir con el "Modo lectura" del input** que procesa textos largos para extracción. Este es OUTPUT-only — leer lo que ya escribiste.

**`.section-eyebrow-serif`** (`src/index.css`) — para eyebrows editoriales de alta carga visual (cita destacada, ornaments). Spectral con `font-variant-caps: small-caps` + `text-transform: lowercase`, tracking 0.08em. Reemplaza el patrón `text-micro uppercase tracking-eyebrow` cuando querés algo MÁS refinado y MENOS shouty. Nota: Spectral en Google Fonts NO trae glyphs smcp reales; el browser los sintetiza (decente, no perfecto). Si fuera crítico, importar Spectral con `&display=swap&text=…` específico — pero no vale la pena hoy.

**Acknowledged-but-active pattern (γ3)** — para indicadores que avisan de algo (dot rojo de health alerts) Y que el usuario puede "reconocer" sin resolver. La función `acknowledgeHealthAlerts(codes)` se llama al abrir Settings; persiste los códigos vistos en localStorage. Si un código NUEVO aparece después, vuelve a iluminar. Si una alerta se va y vuelve (mismo código), también re-aparece — el set se REEMPLAZA por completo, no se acumula. Replicable para cualquier sistema de "notificación que el usuario puede silenciar hasta que cambie".

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
- **Auth real (Netlify Identity) + multi-user.** Hoy single-user implícito (sin `user_id` en las tablas). Plan completo en [`docs/migracion-multi-user.md`](docs/migracion-multi-user.md) — 4-6 commits separados, ~12-15h. Solo ejecutar si se decide compartir Trama. Mientras sea uso personal, deferido por diseño.
- **Migrar grafo a xyflow.** El renderer SVG escala bien hasta ~1k nodos; a partir de ahí ya está sigma.js (commit Q). xyflow es otra opción si se quiere un sistema de nodos más interactivo (drag, conexiones manuales).
- **UI de gestión de tipos.** Las tablas existen, los endpoints existen. Falta el formulario.
- **Tests de componentes UI con React Testing Library.** El scaffold de Vitest está; agregar `@testing-library/react` cuando se quiera cubrir UI.
- **Streaming nativo en Anthropic y Gemini.** Hoy `askLLMForTextStreaming` cae a un único chunk en esos providers. Implementarlo cuando se use uno de ellos en producción.
- **Búsqueda dentro de hilos de chat.** Los mensajes están en DB con índice por thread, pero no hay endpoint de search en el contenido. Trivial de agregar cuando haga falta.
