# Arquitectura de Trama

Este documento da la vista panorámica del sistema. Para detalles de
cada subsistema, mirá los demás archivos en `docs/conventions/`.

---

## Vista de pájaro

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              NAVEGADOR                                   │
│                                                                          │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │  React SPA (Vite + TypeScript)                                  │   │
│   │                                                                  │   │
│   │   App.tsx ─┬─ AuthGate (Clerk si está configurado)              │   │
│   │            ├─ AppPinGate (opcional)                              │   │
│   │            └─ Shell                                              │   │
│   │                ├─ Sidebar / MobileBottomNav                      │   │
│   │                ├─ TopBar                                          │   │
│   │                └─ ViewRouter ─── 8 vistas                        │   │
│   │                                                                  │   │
│   │   state/  (hooks TanStack Query)  ←──── api/  (cliente HTTP)    │   │
│   │                                                                  │   │
│   │   Identidad: Spectral · Inter · Caveat · JetBrains Mono         │   │
│   │   3 temas: paper · night · vela                                  │   │
│   └────────────────────────────┬───────────────────────────────────┘   │
└──────────────────────────────────│───────────────────────────────────────┘
                                   │ fetch + Bearer JWT
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          NETLIFY EDGE                                    │
│                                                                          │
│   66 endpoints /api/* (functions/*.mts)                                  │
│                                                                          │
│   Cada endpoint pasa por withObservability() →                          │
│      • inyecta requestId UUID                                            │
│      • logs estructurados JSON                                            │
│      • captura errores → ApiErrors canónico                              │
│      • getAuthedUser() (Clerk JWT verify; legacy solo transición/dev)   │
│      • parseJsonBody(Zod) en CRUD core                                  │
│                                                                          │
│   _lib/                                                                  │
│     ├─ db.ts        getSql() + wrapper de contexto RLS                  │
│     ├─ auth.ts      verifyToken + ALLOW_LEGACY_FALLBACK                 │
│     ├─ user-rls.ts  app.current_user_id / app.rls_bypass                │
│     ├─ llm.ts       askLLMForJson / Text / Streaming                    │
│     ├─ llm/         providers: deepseek · openai · anthropic · gemini   │
│     ├─ embeddings.ts  embedSafe(text) → vector + model                  │
│     ├─ cost-cap.ts  AI_MONTHLY_BUDGET_CENTS enforcement                 │
│     └─ schemas.ts   Zod por dominio                                     │
└────────────┬─────────────────────┬──────────────────────────────────────┘
             │                     │                          │
             ▼                     ▼                          ▼
   ┌────────────────┐    ┌─────────────────┐       ┌──────────────────┐
   │  Neon Postgres │    │ Netlify Blobs   │       │ LLM providers    │
   │                │    │                 │       │                  │
   │  • pgvector    │    │ momentos-media  │       │ • DeepSeek       │
   │  • HNSW idx    │    │ (fotos/audio)   │       │ • OpenAI         │
   │  • soft delete │    │                 │       │ • Anthropic      │
   │  • user_id en  │    │                 │       │ • Gemini         │
   │    dominios    │    │                 │       │ • Spotify OAuth  │
   │  • RLS FORCE   │    │                 │       │                  │
   └────────────────┘    └─────────────────┘       └──────────────────┘
```

---

## Capas (frontend)

El frontend tiene 5 capas, cada una con responsabilidad clara:

```
┌─────────────────────────────────────────────────────────┐
│  components/                                            │
│  Vista — JSX + Tailwind. Sin fetch, sin state global.  │
│  Recibe data + callbacks por props.                     │
└─────────────────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────────────────┐
│  state/  (TanStack Query hooks)                         │
│  useEntitiesQuery, useAddEntity, useUpdateMomento, …    │
│  Maneja cache, optimistic updates, invalidación.        │
└─────────────────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────────────────┐
│  api/  (cliente HTTP)                                   │
│  Transforma snake_case ↔ camelCase en la frontera.      │
│  Inyecta Bearer JWT vía ApiAuthBridge + useAuth().      │
└─────────────────────────────────────────────────────────┘
                       │
                       │  fetch /api/*
                       ▼
┌─────────────────────────────────────────────────────────┐
│  netlify/functions/*.mts                                │
│  Handler de ruta. Body validation con Zod.              │
│  Despachar a SQL + LLM + Blobs.                         │
└─────────────────────────────────────────────────────────┘
                       │
┌─────────────────────────────────────────────────────────┐
│  _lib/                                                  │
│  Lógica compartida. Sin handler propio, todo helpers.   │
└─────────────────────────────────────────────────────────┘
```

**Regla de cruce:** una capa solo importa de las que están debajo.
`components/` jamás llama `fetch()`; `state/` jamás importa de
`components/`; etc.

---

## Flujo: crear una cita (ejemplo)

```
QuoteForm
   │ user hace click en "guardar"
   ▼
useAddQuote (state/)
   │ mutateAsync({entityId, text, …})
   ▼
api.addQuote (api/quotes.ts)
   │ POST /api/quotes  (Bearer JWT)
   ▼
quotes.mts (Netlify function)
   │ withObservability + getAuthedUser
   │ parseJsonBody(QuoteCreateBody)  ← Zod
   │
   ├──► embedSafe(text + entityName)  ← LLM provider
   │     └─► OpenAI text-embedding-3-small (best-effort)
   │
   └──► sql`INSERT INTO quotes (…, embedding, user_id) VALUES (…)`
         │
         ▼
       Neon Postgres
       │ ⤺ row insertada con embedding + soft-delete-able
       ▼
   Response 201 con la cita creada
   │
   ▼
useAddQuote.onSuccess → invalidate('quotes') → UI se actualiza
```

---

## Flujo: búsqueda semántica

```
User escribe en CommandPalette o filtro
   │
   ▼
search.mts (Netlify function)
   │
   ├─ Lexical:  tsvector + trigrams
   │   sql`WHERE search_text @@ plainto_tsquery(…)`
   │
   └─ Semantic: embedding del query + HNSW vector search
       │
       ├─ embedSafe(query)
       └─ sql`ORDER BY embedding <=> ${queryVec}::vector LIMIT 10`
                   │
                   ▼
              Neon Postgres + pgvector
              (HNSW index sobre entities.embedding, quotes.embedding)
```

---

## Modelo de datos (core)

```
users                            entities ───┐
  id (Clerk sub or legacy)         user_id    │
                                  ─type        │
                                   name        │ (1) ─── (n) ──┐
                                   embedding              │       │
                                   deleted_at             │       │
                                                          │       │
                                                  quotes  │   relationships
                                                  user_id │     user_id
                                                  entity_id    from_id
                                                  text         to_id
                                                  embedding    type
                                                  deleted_at   deleted_at

momentos                       chat_threads ──┐
  user_id                        user_id       │
  kind (nota|recorte|foto)       title         │
  payload (JSONB)                context       │ (1) ─── (n) ──► chat_messages
  embedding                      deleted_at                            user_id
  captured_at                                                          thread_id
  deleted_at                                                           role (user|assistant)
                                                                       content
                                                                       proposal (JSONB nullable)
```

- **Soft delete** universal: nunca `DELETE`, siempre `UPDATE deleted_at = NOW()`.
- **`origin` JSONB** en todas las tablas con escritura — guarda `{kind, provider?, model?}`.
- **`embedding` vector(1536)** en `entities`, `quotes`, `momentos` (best-effort).
- **HNSW** index sobre cada columna embedding.
- **Composite indexes** `(user_id, updated_at DESC) WHERE deleted_at IS NULL` para queries paginadas.

---

## Auth flow

```
┌─ Sin CLERK_SECRET_KEY ───────────────────────────────┐
│                                                       │
│  Toda request resuelve user_id = 'legacy-single-user' │
│  AppPinGate puede estar activo o no (opcional)        │
│                                                       │
└───────────────────────────────────────────────────────┘

┌─ Con Clerk configurado ──────────────────────────────────────┐
│                                                               │
│  Browser ──── ClerkProvider ─── Bearer JWT ──┐               │
│                                              ▼                │
│                            getAuthedUser(request)             │
│                            • verifyToken(JWT) → {sub}         │
│                            • registra app.current_user_id      │
│                            • si falla y ALLOW_LEGACY_FALLBACK │
│                              → 'legacy-single-user'           │
│                            • si falla y NO fallback           │
│                              → throw UnauthenticatedError     │
│                                  │                            │
│                                  ▼                            │
│                            handler-wrap captura → 401         │
└───────────────────────────────────────────────────────────────┘
```

---

## RLS runtime

Trama usa Row Level Security como segunda barrera de privacidad. Los endpoints
siguen filtrando por `user_id`, pero Postgres también fuerza que las tablas
privadas solo vean filas del usuario declarado en el contexto transaccional.

```
withObservability()
   │ limpia contexto RLS previo
   ▼
getAuthedUser(req)
   │ setCurrentRlsUser(userId)
   ▼
getSql()
   │ scopeSqlToRlsContext()
   ▼
sql`SELECT ... FROM entities ...`
   │ transaction:
   │   1. SELECT set_config('app.current_user_id', userId, true)
   │   2. query de negocio
   ▼
Postgres RLS policy
   │ user_id = current_setting('app.current_user_id')
   ▼
filas del usuario actual
```

Los crons internos que necesitan recorrer todos los usuarios declaran
`runWithSystemRls(...)`, que setea `app.rls_bypass = 'system'` dentro de la
transacción. Ese bypass es operativo, no una API de producto.

Este modelo no es cero-conocimiento: el dueño de infraestructura con acceso
directo a Neon, Netlify Blobs, variables o logs sigue pudiendo leer datos. El
límite exacto está documentado en
[`ADR-0010`](adr/0010-rls-privacy-boundary.md).

---

## Cost cap & observabilidad

```
askLLMForJson / askLLMForText
        │
        ▼
   checkCostCap()  ◄── extraction_log aggregate (per month)
        │
   ¿budget excedido?
   ├─ sí → 429 RATE_LIMITED (no llama al provider)
   └─ no
        │
        ▼
   Provider HTTP call
        │
        ▼
   Calcula tokens usados + costo
        │
        ▼
   INSERT INTO extraction_log (provider, model, cost_cents, …, user_id)
```

---

## Stack en tabla

| Capa       | Tech                                   | Por qué                             |
| ---------- | -------------------------------------- | ----------------------------------- |
| Build      | Vite                                   | rápido; ESM nativo                  |
| UI         | React 18                               | concurrent rendering                |
| Types      | TypeScript strict                      | `noUncheckedIndexedAccess` activado |
| Estilos    | Tailwind CSS                           | tokens via CSS vars, 3 temas        |
| Data       | TanStack Query v5                      | cache + invalidación declarativa    |
| Validación | Zod                                    | server-side defense in depth        |
| Backend    | Netlify Functions (Node 22 ESM)        | edge-deployed, sin servidor         |
| DB         | Neon Postgres + pgvector               | serverless; embeddings nativos      |
| Storage    | Netlify Blobs                          | fotos y audios de momentos          |
| Auth       | Clerk                                  | JWT + UI prefab; prod sin fallback  |
| LLM        | DeepSeek / OpenAI / Anthropic / Gemini | abstracción por provider            |
| Spotify    | OAuth + Web API                        | escuchas + playlists                |
| Test       | Vitest + Playwright                    | unit + integration + E2E            |
| Deploy     | Netlify Git-based                      | preview por PR                      |

---

## Superficie de dominios vivos

- **Home**: `GET /api/home` entrega portada liviana con counts y actividad reciente, evitando descargar entidades, citas y relaciones completas en primer paint.
- **Grafo / Cronologia**: entities, quotes y relationships son la base atemporal; cronologia deriva lecturas recientes con filtros por `user_id`.
- **Momentos**: memoria fechada con `payload jsonb`, Blobs para fotos, links N:M soft-deletables y preview de URLs autenticado.
- **Atlas**: snapshot/propuesta IA de clusters; cualquier generación pasa por cost-cap y `extraction_log`.
- **Cronicas**: resumen mensual IA por usuario; se cachea por mes y registra costo/usage.
- **Notas y Tasks**: dominios personales con `user_id`, soft-delete e invalidaciones cruzadas hacia Home/Cronologia.
- **X**: tokens/bookmarks/cronicas de X quedan separados por `user_id`; no exponen credenciales al cliente.

---

## Convenciones críticas (links rápidos)

- [AGENTS.md](../AGENTS.md) — reglas absolutas + índice
- [design.md](conventions/design.md) — type scale, animaciones, accesibilidad
- [data.md](conventions/data.md) — getSql(), hooks de estado, blobs
- [llm.md](conventions/llm.md) — abstracción \_lib/llm/
- [api.md](conventions/api.md) — Zod, ApiErrors, patrón para endpoints
- [dominios.md](conventions/dominios.md) — patterns específicos del grafo, chat, momentos
- [roadmap.md](conventions/roadmap.md) — decisiones aplazadas
