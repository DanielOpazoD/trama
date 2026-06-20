# Trama

Mapa cognitivo personal de afinidades intelectuales y estéticas.

Un lugar donde guardar las ideas que han pasado por la cabeza —propias o prestadas— y dejar que con el tiempo el mapa muestre por dónde se ha movido el pensamiento, qué patrones aparecen, qué cosas aparentemente desconectadas resultan estar unidas.

> Para entender **qué es Trama y por qué existe**, ver [`FILOSOFIA.md`](./FILOSOFIA.md). Es la pieza más importante del repositorio.

## Funciones

**Grafo.** Vista principal. Cuatro modos de layout: orgánico (fuerzas), por tipo (cluster por persona/libro/canción/etc.), por año (timeline horizontal), por densidad (los hubs al centro). Drag para reacomodar nodos; el botón _Reorganizar_ recalcula desde cero. _Descubrir con IA_ propone relaciones nuevas entre entidades existentes.

**Entidades.** 24 tipos: persona, escritor, filósofo, músico, banda, director, artista, científico, libro, ensayo, poema, artículo, canción, podcast, álbum, disco, película, serie, documental, obra, concepto, idea, lugar, evento. Los tipos viven en la DB; agregar uno nuevo es un INSERT. _Reclasificar con IA_ revisa toda la lista y propone tipos mejores (ej. "Pink Floyd" como `persona` → `banda`).

**Citas.** Texto literal asociado a una entidad, con fuente y contexto opcionales. Las notas rápidas que añades desde el detalle de una entidad son citas sin fuente.

**Relaciones.** Vínculos dirigidos tipados entre entidades (_influye en_, _cita a_, _responde a_, _me llegó por_, _suena como_, _inspira_, _contradice_, _asociado con_). Crear manualmente o pedirle a la IA que las descubra.

**Escuchas.** Lo que has reproducido en Spotify, agrupado por artista / álbum / canción, con sync automático cada 3 horas. Importar playlist por URL: la IA extrae artistas y canciones con sus links de Spotify y te los propone como entidades + relaciones.

**Chat.** Conversación con una IA que tiene tu trama completa cargada como contexto (hasta 80 entidades, 150 relaciones y 60 citas). Hilos persistidos, streaming de respuestas, propuestas inline para agregar entidades/relaciones/citas o reclasificar — todo con un clic, nada automático.

**Extractor.** Pega un párrafo desordenado en la barra de abajo del grafo; la IA propone entidades, relaciones y citas que aparezcan en el texto.

**Búsqueda.** Full-text (tsvector) + trigrams para tolerancia a typos. Caja en el sidebar.

**Detalle de entidad.** Click en cualquier nodo abre un panel lateral con descripción editable, citas asociadas, conexiones, y para entidades musicales un campo `spotify_url` con botón _Abrir en Spotify_.

## Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind
- **Backend:** Netlify Functions (Node 22, ESM)
- **Database:** Netlify Database (Postgres serverless de Neon) vía `@netlify/database`
- **LLM:** DeepSeek por defecto, con abstracción multi-proveedor (OpenAI, Anthropic, Gemini)
- **Streaming:** SSE para el chat (provider-side cuando lo soporta, fallback de un solo chunk si no)
- **Tests:** Vitest

Ver [`ARCHITECTURE.md`](./ARCHITECTURE.md) para detalle de decisiones técnicas y modelo de datos.
Ver [`CLAUDE.md`](./CLAUDE.md) para convenciones que no deben romperse sin pensarlo dos veces.

## Desarrollo local

```bash
npm install
npm run dev          # http://localhost:5173 con localStorage fallback
npm test             # corre Vitest
npm run typecheck    # tsc -b
npm run build        # tsc + vite build
```

Sin backend desplegado, la app funciona en modo local: los datos viven en `localStorage` del navegador. Cuando se conecta a Netlify (con DB provisionada), los datos pasan a Postgres.

### Opción A — Netlify CLI (recomendado)

```bash
netlify dev
```

Provisiona DB local de prueba y monta functions. Requiere `netlify` CLI logueado.

### Opción B — Docker Postgres local

```bash
cp .env.example .env       # editar con tu AI_API_KEY
npm run db:up              # levanta Postgres en localhost:5433 y aplica migraciones
netlify dev                # arranca functions con .env vars
```

Comandos útiles:

- `npm run db:reset` — borra y recrea la base (datos perdidos, schema fresco).
- `npm run db:psql` — abre `psql` interactivo dentro del contenedor.
- `npm run db:down` — apaga el contenedor.

## Variables de entorno (en Netlify dashboard)

| Variable                     | Valores                                               | Descripción                                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_PROVIDER`                | `deepseek` (default), `openai`, `anthropic`, `gemini` | Proveedor del LLM                                                                                                                                                                      |
| `AI_API_KEY`                 | string                                                | Key del proveedor elegido                                                                                                                                                              |
| `AI_MAX_TOKENS`              | int (default `4096`)                                  | Cap de tokens de respuesta del LLM                                                                                                                                                     |
| `AI_CACHE_TTL_SECONDS`       | int (default `600`)                                   | TTL del cache in-memory del LLM. `0` desactiva.                                                                                                                                        |
| `AI_MONTHLY_BUDGET_CENTS`    | int (default `5000`)                                  | Cap mensual de gasto del LLM en centavos USD. Las llamadas se cortan al cap.                                                                                                           |
| `AI_VISION_PROVIDER`         | `openai` o `gemini` (opcional)                        | Provider separado para llamadas con imagen. Necesario si `AI_PROVIDER` es DeepSeek o Anthropic (que no soportan visión). Si `AI_PROVIDER=openai` o `gemini`, esta var no es necesaria. |
| `AI_VISION_API_KEY`          | string (opcional)                                     | Key del provider de visión. Necesaria si `AI_VISION_PROVIDER` está definida.                                                                                                           |
| `NETLIFY_DB_URL`             | string                                                | Auto-provisionada por la extensión Netlify Database. `getSql()` la resuelve internamente; el código no la lee directo.                                                                 |
| `CLERK_SECRET_KEY`           | string (opcional)                                     | Activa verificación backend de JWT Clerk. Sin esto, dev/single-user cae al usuario legacy.                                                                                             |
| `VITE_CLERK_PUBLISHABLE_KEY` | string (opcional)                                     | Activa `ClerkProvider` en el cliente.                                                                                                                                                  |
| `LEGACY_OWNER_CLERK_ID`      | string (opcional)                                     | Mapea el Clerk ID del dueño a `legacy-single-user` durante el cutover.                                                                                                                 |
| `ALLOW_LEGACY_FALLBACK`      | `true` solo en dev/cutover                            | Permite requests sin token como `legacy-single-user`. Producción debe ir a `false` antes de abrir multi-user real.                                                                     |
| `SPOTIFY_CLIENT_ID`          | string                                                | OAuth client id de tu app en Spotify Developer                                                                                                                                         |
| `SPOTIFY_CLIENT_SECRET`      | string                                                | OAuth client secret. **NUNCA al frontend.**                                                                                                                                            |
| `SPOTIFY_REDIRECT_URI`       | url                                                   | Debe coincidir exacta con la registrada en Spotify Developer                                                                                                                           |

## Configurar Spotify

1. Ve a [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) y crea una app nueva.
2. **Settings → Redirect URIs**: agrega ambas URLs (una para desarrollo, otra para producción):
   - `http://localhost:5173/api/spotify/callback` (dev local)
   - `https://tramadaod.netlify.app/api/spotify/callback` (producción)
3. Copia el **Client ID** y el **Client Secret** a las env vars de Netlify (o tu `.env` local).
4. En `SPOTIFY_REDIRECT_URI`, pon la URL que corresponde al entorno (la de localhost para `.env` local; la de producción para Netlify).
5. Abre Trama → _Configuración_ → _Spotify_ → _Conectar con Spotify_. Te llevará a la pantalla de consentimiento de Spotify, autoriza, y volverás a Trama conectado.
6. Después: clic en _Sincronizar ahora_ para traer tus últimas 50 reproducciones. Las verás en la pestaña **Escuchas** del sidebar, agrupadas por artista, álbum o canción.

Spotify solo retiene las 50 reproducciones más recientes — un sync regular es lo que mantiene el log completo.

**Sync automático cada 3 horas:** la función `netlify/functions/spotify-scheduled-sync.mts` corre 8 veces al día (a las 00, 03, 06, 09, 12, 15, 18, 21 UTC) sin que tengas que hacer nada. La dispara Netlify en sus servidores; tu app puede estar cerrada. Si Spotify no está conectado, la función es un no-op silencioso. Para cambiar la frecuencia, edita el `schedule` en ese archivo.

**Scopes pedidos:** `user-read-recently-played`, `user-read-currently-playing`, `user-top-read`, `user-read-private`, `playlist-read-private`, `playlist-read-collaborative`. Si actualizas el listado, los usuarios existentes deben desconectar y reconectar Spotify.

**Importar playlist:** en la pestaña _Escuchas_, pega un enlace `https://open.spotify.com/playlist/...` y la IA te devuelve una propuesta con todos los artistas y canciones (cada uno con su link de Spotify ya enlazado) lista para revisar.

## Deploy

Push a `main` → Netlify build automático → migraciones aplicadas → sitio live.

Primera vez: en el dashboard de Netlify hay que:

1. Vincular el repo de GitHub (si no está vinculado).
2. Activar Netlify Database desde la pestaña _Integrations_ o esperar a que la dependencia `@netlify/database` la provisione.
3. Setear `AI_PROVIDER` y `AI_API_KEY`.
4. (Recomendado) Activar password protection en _Site settings → Visitor access_.

## Comandos comunes

```bash
npm run test:watch          # Vitest en modo watch
npm run test:coverage       # con reporte de cobertura
npm run preview             # vite preview del build
```

## Arquitectura

Para la vista de pájaro del sistema (capas, flujos, modelo de datos),
ver [`docs/arquitectura.md`](docs/arquitectura.md). Incluye diagramas
del flujo de auth, embeddings, búsqueda semántica y cost-cap.

Las **convenciones críticas** viven en:

- [`CLAUDE.md`](CLAUDE.md) — reglas absolutas + índice
- [`docs/conventions/`](docs/conventions/) — design tokens, data layer,
  LLM, API, dominios

## Layout del repo

```
trama/
├── src/                                  # frontend
│   ├── App.tsx                           # shell + ClerkProvider + AuthGate + AppPinGate
│   ├── main.tsx                          # entry point + ClerkProvider opcional
│   ├── index.css                         # design tokens (3 temas) + componentes globales
│   ├── api/                              # cliente HTTP con transforms snake↔camel
│   │   ├── index.ts                      # facade `api.*`
│   │   ├── request.ts                    # fetch + ApiAuthBridge Bearer JWT injection
│   │   ├── entities.ts · quotes.ts · momentos.ts · …
│   │   └── transform.ts                  # camelCase ↔ snake_case
│   ├── state/                            # hooks TanStack Query por dominio
│   │   ├── index.ts                      # facade reexporta todo
│   │   ├── queryClient.ts                # config global
│   │   ├── useEntities.ts · useQuotes.ts · useRelationships.ts
│   │   ├── useMomentos.ts · useChat.ts · useExtract.ts · useAsk.ts
│   │   ├── useSuggestRelationships.ts · useReclassifyEntities.ts
│   │   ├── useToast.ts · useGlobalStatus.ts · useCounts.ts
│   │   └── useExportImport.ts
│   ├── types/                            # tipos compartidos
│   │   ├── entity.ts · quote.ts · relationship.ts · momento.ts · origin.ts
│   │   └── index.ts                      # facade
│   ├── schemas/                          # Zod schemas (lado cliente)
│   │   └── momento.ts
│   ├── lib/                              # utilidades sin React
│   │   ├── sectionAccent.ts              # SECTION_ACCENT per ViewMode
│   │   ├── sectionWash.ts                # radial wash inline style
│   │   ├── viewTransition.ts             # wrapper de View Transitions API
│   │   └── clientErrorTracking.ts
│   ├── hooks/                            # hooks sin React Query
│   │   ├── useGraphLayout.ts             # orquesta los 4 modos de layout
│   │   ├── usePanZoom.ts · useFreshIds.ts · useFocusTrap.ts
│   │   ├── useIsMobile.ts · usePullToRefresh.ts · useTheme.ts
│   │   └── layouts/                      # organic · byType · byYear · byDegree
│   └── components/                       # vistas + paneles
│       ├── App-level
│       │   ├── Sidebar.tsx · MobileBottomNav.tsx · TopBar.tsx
│       │   ├── ViewRouter.tsx · ViewHeader.tsx · SectionAccentBand.tsx
│       │   ├── AuthGate.tsx · AppPinGate.tsx
│       │   ├── Splash.tsx · Onboarding.tsx · CommandPalette.tsx · ShortcutsModal.tsx
│       │   ├── Settings.tsx + settings/ (8 paneles)
│       │   └── ToastHost.tsx · ConfirmDestroy.tsx · LoadingHint.tsx · Paginator.tsx
│       ├── Views
│       │   ├── HomeView.tsx + home/{Greeting,FeaturedQuote,FirstMomentPreview,…}
│       │   ├── GraphView.tsx + graph/{GraphNode,GraphEdge,GraphToolbar,HoverPreviewCard,…}
│       │   ├── EntitiesView.tsx + entities/{EntityForm,EntityRow,AIMenu,…}
│       │   ├── QuotesView.tsx + quotes/{QuoteForm,QuoteItem}
│       │   ├── RelationshipsView.tsx
│       │   ├── MomentosView.tsx + momentos/{MomentoEntry,MomentoComposer,MomentoEditModal,editModal/*,…}
│       │   ├── ListeningView.tsx + listening/{PlaysSummary,PlaylistImporter,PlaysTiming,SuggestArtists}
│       │   ├── ChatView.tsx + chat/{MessageBubble,EmptyChatHint,FilterChip,InlineProposal,threadLabels}
│       │   └── ProactiveView.tsx
│       └── RightPanel.tsx · NodeDetailPanel.tsx · QuoteCard.tsx · ProposalPanel.tsx
├── e2e/                                  # Playwright specs
│   ├── fixtures.ts                       # mockBackend compartido
│   └── *.spec.ts                         # add-entity · add-quote · chat-send · momentos · …
└── netlify/
    ├── database/migrations/              # SQL versionado, aplicado en deploy
    └── functions/                        # 93 endpoints `.mts`
        ├── _lib/                         # lógica compartida
        │   ├── db.ts                     # getSql() singleton
        │   ├── auth.ts                   # Clerk verifyToken + ALLOW_LEGACY_FALLBACK
        │   ├── handler-wrap.ts           # withObservability + ApiErrors catch
        │   ├── api-error.ts              # ApiErrors.* — shape canónico
        │   ├── zod-body.ts               # parseJsonBody helper
        │   ├── observability.ts          # request-id + logs JSON
        │   ├── db helpers …
        │   ├── llm.ts + llm/             # provider abstraction (deepseek/openai/anthropic/gemini)
        │   ├── embeddings.ts             # embedSafe(text) → vector
        │   ├── cost-cap.ts               # AI_MONTHLY_BUDGET_CENTS enforcement
        │   ├── rag-context.ts            # builder de contexto para chat/ask
        │   ├── schemas: entity/quote/relationship/momento-schemas.ts
        │   ├── prompts: extract/reclassify/reflect/chat/proactive/ask/suggest-relationships
        │   ├── validators: extract/reclassify/chat-validate.ts
        │   ├── spotify.ts                # OAuth + sync + playlist fetch
        │   └── tests: isolation*.test.ts · *-endpoint.test.ts · *.test.ts
        ├── CRUD core
        │   ├── entities.mts · quotes.mts · relationships.mts · momentos.mts
        │   └── *-restore (cascade soft-undelete)
        ├── Búsqueda y agregaciones
        │   ├── search.mts (lexical + semantic) · query.mts (motor de queries)
        │   ├── query-nl.mts (lenguaje natural → query)
        │   ├── saved-queries.mts (consultas guardadas · Fase 4)
        │   ├── object-properties.mts (propiedades + tags de objetos)
        │   ├── counts.mts · entities-lookup.mts · entities-refs-count.mts
        │   └── graph-neighbors.mts
        ├── IA
        │   ├── extract.mts · reclassify-entities.mts · suggest-relationships.mts
        │   ├── ask.mts · chat-threads.mts · chat-messages.mts (SSE)
        │   ├── proactive-suggestions.mts · quote-reflect.mts
        │   ├── reindex-embeddings.mts · extract-from-image.mts
        │   └── extraction-log.mts
        ├── Momentos
        │   ├── momentos-file.mts (sirve blobs) · momentos-upload.mts
        │   ├── momentos-merge.mts · momentos-restore.mts
        │   ├── momentos-orphaned-blobs.mts · momentos-url-preview.mts
        ├── Spotify
        │   ├── spotify-{login,callback,status,sync,scheduled-sync,plays,timing,
        │   │            suggest-artists,import-playlist,library-snapshot}.mts
        ├── Datos
        │   ├── export.mts · import.mts
        └── Sistema
            ├── ai-settings.mts · entity-types.mts · relationship-types.mts
            ├── error-log.mts · health.mts · cost-alert-check.mts (cron)
```

## Tests

Vitest co-localizado + Playwright para E2E. CI corre lint/format, guardrails
custom, typecheck, tests, coverage con thresholds, build, bundle budget, audit,
E2E + axe y gitleaks en cada push/PR (`.github/workflows/test.yml`).

```bash
npm test               # unit/integration (Vitest) — una corrida
npm run test:coverage  # coverage con thresholds calibrados en vitest.config.ts
npm run test:watch     # modo watch
npm run e2e            # Playwright — requiere build previo
```

**Cobertura activa:**

- **Lógica pura:** validadores de propuestas LLM (extract, reclassify, chat), prompts, dispatch por proveedor, layouts del grafo, transforms snake↔camel del cliente.
- **Endpoints:** `*-endpoint.test.ts` mockea `getSql()` y verifica request → SQL → response.
- **Multi-user isolation:** `isolation*.test.ts` confirman que cada endpoint CRUD incluye `user_id` en las queries y respeta el modo legacy.
- **React components:** RTL para los más críticos (EntityForm, QuoteForm, EmptyMessage, AITaskSettings, etc.).
- **E2E:** 9 flujos cubren añadir entidad/cita/momento, chat send, navegación entre vistas, búsqueda sidebar, a11y.

## Multi-user

La app fue diseñada inicialmente como single-user y migra incrementalmente a multi-user. Estado actual:

| Pieza                                      | Estado                                         |
| ------------------------------------------ | ---------------------------------------------- |
| Schema con `user_id` en tablas de dominio  | ✅ Migraciones aplicadas                       |
| Composite indexes `(user_id, …)`           | ✅                                             |
| `getAuthedUser()` en endpoints HTTP        | ✅ con guardrail CI                            |
| Schemas Zod en CRUD core                   | ✅                                             |
| Isolation tests                            | ✅                                             |
| `AuthGate` + `ClerkProvider` opcional      | ✅ scaffolding                                 |
| `ApiAuthBridge` + Bearer JWT en fetch      | ✅ `useAuth().getToken()`                      |
| `AppPinGate` (PIN opcional desde Settings) | ✅                                             |
| **Blobs con prefijo `userId/`**            | ✅                                             |
| **Cost-cap per-user**                      | ✅ `users.monthly_budget_cents` + fallback env |
| **Spotify OAuth per-user**                 | ✅                                             |
| **UI login / logout**                      | ✅ `AuthGate` + `UserButton`                   |

Sin `CLERK_SECRET_KEY` la app funciona en modo single-user (todos los datos contra `legacy-single-user`). Activar Clerk en cutover es agregar `VITE_CLERK_PUBLISHABLE_KEY` y `CLERK_SECRET_KEY` juntas, más `LEGACY_OWNER_CLERK_ID` para mapear al dueño histórico; antes de abrir multi-user real, `ALLOW_LEGACY_FALLBACK` debe quedar apagado. `npm run check:legacy-fallback` falla si Clerk queda configurado solo en frontend o solo en backend.

## Contribuir

Este es un proyecto personal de [Daniel Opazo](https://github.com/DanielOpazoD).

Si querés tirar un PR o reportar algo, los flujos esperados son:

1. **Issues:** abrí uno antes de tirar PRs grandes. Si es un fix chico, podés ir directo al PR.
2. **Convenciones:** leer [CLAUDE.md](CLAUDE.md) y los docs de [`docs/conventions/`](docs/conventions/). Las reglas en CLAUDE.md son inmutables (migraciones SQL no se editan, soft delete obligatorio, snake_case ↔ camelCase en la frontera, etc.).
3. **Tests:** todo PR debe pasar `npm test` + `npm run typecheck` + `npm run build`; CI suma coverage, E2E y guardrails.
4. **Fronteras:** los `*ViewModel.ts` de componentes deben mantenerse puros. `npm run check:frontend-boundaries` bloquea imports de React/state/API runtime.
5. **Bundle:** si el tamaño crece más allá del budget de `scripts/check-bundle-size.mjs`, entendé por qué antes de subir el budget. Es un termómetro, no un check de papel.
6. **Estilo de commits:** breves en imperativo (`fix: …`, `chore: …`, `feat: …`). Si tu cambio explica el “por qué”, mejor.

Para preguntas concretas sobre algún subsistema, los docs de [`docs/`](docs/) cubren operacionales (deploy, datos, incidentes, AI) y los de [`docs/conventions/`](docs/conventions/) cubren patrones de diseño y arquitectura.
