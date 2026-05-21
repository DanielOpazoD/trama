# Trama

Mapa cognitivo personal de afinidades intelectuales y estéticas.

Un lugar donde guardar las ideas que han pasado por la cabeza —propias o prestadas— y dejar que con el tiempo el mapa muestre por dónde se ha movido el pensamiento, qué patrones aparecen, qué cosas aparentemente desconectadas resultan estar unidas.

> Para entender **qué es Trama y por qué existe**, ver [`FILOSOFIA.md`](./FILOSOFIA.md). Es la pieza más importante del repositorio.

## Funciones

**Grafo.** Vista principal. Cuatro modos de layout: orgánico (fuerzas), por tipo (cluster por persona/libro/canción/etc.), por año (timeline horizontal), por densidad (los hubs al centro). Drag para reacomodar nodos; el botón *Reorganizar* recalcula desde cero. *Descubrir con IA* propone relaciones nuevas entre entidades existentes.

**Entidades.** 24 tipos: persona, escritor, filósofo, músico, banda, director, artista, científico, libro, ensayo, poema, artículo, canción, podcast, álbum, disco, película, serie, documental, obra, concepto, idea, lugar, evento. Los tipos viven en la DB; agregar uno nuevo es un INSERT. *Reclasificar con IA* revisa toda la lista y propone tipos mejores (ej. "Pink Floyd" como `persona` → `banda`).

**Citas.** Texto literal asociado a una entidad, con fuente y contexto opcionales. Las notas rápidas que añades desde el detalle de una entidad son citas sin fuente.

**Relaciones.** Vínculos dirigidos tipados entre entidades (*influye en*, *cita a*, *responde a*, *me llegó por*, *suena como*, *inspira*, *contradice*, *asociado con*). Crear manualmente o pedirle a la IA que las descubra.

**Escuchas.** Lo que has reproducido en Spotify, agrupado por artista / álbum / canción, con sync automático cada 3 horas. Importar playlist por URL: la IA extrae artistas y canciones con sus links de Spotify y te los propone como entidades + relaciones.

**Chat.** Conversación con una IA que tiene tu trama completa cargada como contexto (hasta 80 entidades, 150 relaciones y 60 citas). Hilos persistidos, streaming de respuestas, propuestas inline para agregar entidades/relaciones/citas o reclasificar — todo con un clic, nada automático.

**Extractor.** Pega un párrafo desordenado en la barra de abajo del grafo; la IA propone entidades, relaciones y citas que aparezcan en el texto.

**Búsqueda.** Full-text (tsvector) + trigrams para tolerancia a typos. Caja en el sidebar.

**Detalle de entidad.** Click en cualquier nodo abre un panel lateral con descripción editable, citas asociadas, conexiones, y para entidades musicales un campo `spotify_url` con botón *Abrir en Spotify*.

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

| Variable | Valores | Descripción |
|---|---|---|
| `AI_PROVIDER` | `deepseek` (default), `openai`, `anthropic`, `gemini` | Proveedor del LLM |
| `AI_API_KEY` | string | Key del proveedor elegido |
| `AI_MAX_TOKENS` | int (default `4096`) | Cap de tokens de respuesta del LLM |
| `AI_CACHE_TTL_SECONDS` | int (default `600`) | TTL del cache in-memory del LLM. `0` desactiva. |
| `AI_MONTHLY_BUDGET_CENTS` | int (default `500`) | Cap mensual de gasto del LLM en centavos USD. Las llamadas se cortan al cap. |
| `AI_VISION_PROVIDER` | `openai` o `gemini` (opcional) | Provider separado para llamadas con imagen. Necesario si `AI_PROVIDER` es DeepSeek o Anthropic (que no soportan visión). Si `AI_PROVIDER=openai` o `gemini`, esta var no es necesaria. |
| `AI_VISION_API_KEY` | string (opcional) | Key del provider de visión. Necesaria si `AI_VISION_PROVIDER` está definida. |
| `NETLIFY_DB_URL` | string | Auto-provisionada por la extensión Netlify Database. `getSql()` la resuelve internamente; el código no la lee directo. |
| `SPOTIFY_CLIENT_ID` | string | OAuth client id de tu app en Spotify Developer |
| `SPOTIFY_CLIENT_SECRET` | string | OAuth client secret. **NUNCA al frontend.** |
| `SPOTIFY_REDIRECT_URI` | url | Debe coincidir exacta con la registrada en Spotify Developer |

## Configurar Spotify

1. Ve a [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) y crea una app nueva.
2. **Settings → Redirect URIs**: agrega ambas URLs (una para desarrollo, otra para producción):
   - `http://localhost:5173/api/spotify/callback` (dev local)
   - `https://tramadaod.netlify.app/api/spotify/callback` (producción)
3. Copia el **Client ID** y el **Client Secret** a las env vars de Netlify (o tu `.env` local).
4. En `SPOTIFY_REDIRECT_URI`, pon la URL que corresponde al entorno (la de localhost para `.env` local; la de producción para Netlify).
5. Abre Trama → *Configuración* → *Spotify* → *Conectar con Spotify*. Te llevará a la pantalla de consentimiento de Spotify, autoriza, y volverás a Trama conectado.
6. Después: clic en *Sincronizar ahora* para traer tus últimas 50 reproducciones. Las verás en la pestaña **Escuchas** del sidebar, agrupadas por artista, álbum o canción.

Spotify solo retiene las 50 reproducciones más recientes — un sync regular es lo que mantiene el log completo.

**Sync automático cada 3 horas:** la función `netlify/functions/spotify-scheduled-sync.mts` corre 8 veces al día (a las 00, 03, 06, 09, 12, 15, 18, 21 UTC) sin que tengas que hacer nada. La dispara Netlify en sus servidores; tu app puede estar cerrada. Si Spotify no está conectado, la función es un no-op silencioso. Para cambiar la frecuencia, edita el `schedule` en ese archivo.

**Scopes pedidos:** `user-read-recently-played`, `user-read-currently-playing`, `user-top-read`, `user-read-private`, `playlist-read-private`, `playlist-read-collaborative`. Si actualizas el listado, los usuarios existentes deben desconectar y reconectar Spotify.

**Importar playlist:** en la pestaña *Escuchas*, pega un enlace `https://open.spotify.com/playlist/...` y la IA te devuelve una propuesta con todos los artistas y canciones (cada uno con su link de Spotify ya enlazado) lista para revisar.

## Deploy

Push a `main` → Netlify build automático → migraciones aplicadas → sitio live.

Primera vez: en el dashboard de Netlify hay que:
1. Vincular el repo de GitHub (si no está vinculado).
2. Activar Netlify Database desde la pestaña *Integrations* o esperar a que la dependencia `@netlify/database` la provisione.
3. Setear `AI_PROVIDER` y `AI_API_KEY`.
4. (Recomendado) Activar password protection en *Site settings → Visitor access*.

## Comandos comunes

```bash
npm run test:watch          # Vitest en modo watch
npm run test:coverage       # con reporte de cobertura
npm run preview             # vite preview del build
```

## Layout del repo

```
trama/
├── src/                              # frontend
│   ├── App.tsx                       # shell con sidebar + canvas + paneles
│   ├── api.ts                        # cliente HTTP con transforms snake↔camel
│   ├── state.tsx                     # Provider TanStack Query (sin agregador)
│   ├── state/                        # hooks por dominio
│   │   ├── useEntities.ts            # query, add, update, updateType, delete
│   │   ├── useRelationships.ts
│   │   ├── useQuotes.ts
│   │   ├── useExtract.ts
│   │   ├── useSuggestRelationships.ts
│   │   ├── useReclassifyEntities.ts
│   │   ├── useChat.ts                # threads, messages, streaming send
│   │   ├── useExportImport.ts
│   │   └── offline.tsx
│   ├── storage.ts                    # localStorage fallback
│   ├── types.ts                      # tipos compartidos
│   ├── hooks/
│   │   ├── useGraphLayout.ts         # orquesta los 4 modos de layout
│   │   ├── usePanZoom.ts
│   │   ├── useFreshIds.ts
│   │   └── layouts/
│   │       ├── organic.ts            # Fruchterman-Reingold
│   │       ├── byType.ts             # cluster por tipo de entidad
│   │       ├── byYear.ts             # timeline horizontal
│   │       └── byDegree.ts           # concéntrico por conexiones
│   └── components/                   # vistas y paneles
│       ├── GraphView.tsx
│       ├── EntitiesView.tsx
│       ├── QuotesView.tsx
│       ├── RelationshipsView.tsx
│       ├── ListeningView.tsx
│       ├── ChatView.tsx
│       ├── NodeDetailPanel.tsx       # edit description + spotify_url + add note
│       ├── ProposalPanel.tsx
│       ├── ReclassifyPanel.tsx
│       ├── ExtractBar.tsx
│       ├── Sidebar.tsx
│       ├── Settings.tsx
│       ├── chat/InlineProposal.tsx
│       └── graph/{GraphNode,GraphEdge,GraphToolbar}.tsx
└── netlify/
    ├── database/migrations/          # SQL versionado, aplicado por Netlify en deploy
    └── functions/
        ├── _lib/
        │   ├── db.ts                 # getSql() — wrapper @netlify/database
        │   ├── llm.ts                # askLLMForJson, askLLMForText, askLLMForTextStreaming
        │   ├── extract-prompt.ts
        │   ├── extract-validate.ts
        │   ├── suggest-relationships-prompt.ts
        │   ├── reclassify-prompt.ts
        │   ├── reclassify-validate.ts
        │   ├── chat-prompt.ts
        │   ├── chat-validate.ts
        │   ├── spotify.ts            # OAuth, sync, playlist fetch
        │   ├── handler-wrap.ts
        │   ├── observability.ts
        │   └── cost-cap.ts
        ├── entities.mts              # GET/POST/PATCH/DELETE /api/entities[/:id]
        ├── relationships.mts
        ├── quotes.mts
        ├── entity-types.mts
        ├── relationship-types.mts
        ├── extract.mts               # POST /api/extract — IA estructura texto libre
        ├── suggest-relationships.mts # POST /api/suggest-relationships
        ├── reclassify-entities.mts   # POST /api/reclassify-entities
        ├── chat-threads.mts          # CRUD /api/chat/threads
        ├── chat-messages.mts         # SSE streaming /api/chat/threads/:id/messages
        ├── spotify-callback.mts
        ├── spotify-status.mts
        ├── spotify-sync.mts
        ├── spotify-scheduled-sync.mts # cron 0 */3 * * *
        ├── spotify-plays.mts
        ├── spotify-import-playlist.mts # extracts artists + tracks from URL
        ├── search.mts
        ├── export.mts
        ├── import.mts
        ├── extraction-log.mts
        └── error-log.mts
```

## Tests

Vitest con archivos `*.test.ts` co-localizados. CI corre tipos + tests + build en cada push (`.github/workflows/test.yml`).

```bash
npm test           # corre una vez
npm run test:watch # modo watch
```

Cobertura focalizada en la lógica pura: validadores de propuestas (extract, reclassify, chat), prompts (extract, suggest-relationships, reclassify), dispatch del LLM por proveedor, layouts del grafo, transforms del cliente. Los componentes React de momento se prueban end-to-end con `npm run dev`.

## Contribuir

Este es un proyecto personal de [Daniel Opazo](https://github.com/DanielOpazoD). No hay procesos formales — si tienes algo que sugerir, abre un issue.
