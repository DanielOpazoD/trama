# Trama

Mapa cognitivo personal de afinidades intelectuales y estéticas.

Un lugar donde guardar las ideas que han pasado por la cabeza —propias o prestadas— y dejar que con el tiempo el mapa muestre por dónde se ha movido el pensamiento, qué patrones aparecen, qué cosas aparentemente desconectadas resultan estar unidas.

> Para entender **qué es Trama y por qué existe**, ver [`FILOSOFIA.md`](./FILOSOFIA.md). Es la pieza más importante del repositorio.

## Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind
- **Backend:** Netlify Functions (Node 22, ESM)
- **Database:** Netlify Database (Postgres serverless de Neon)
- **LLM:** DeepSeek por defecto, con abstracción multi-proveedor (OpenAI, Anthropic, Gemini)
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

### Opción A — Netlify CLI (requiere autenticación)

```bash
netlify dev
```

Provisiona DB local de prueba y monta functions. Requiere `netlify` CLI logueado.

### Opción B — Docker Postgres local (recomendado para iterar)

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
| `AI_PROVIDER` | `deepseek` (default), `openai`, `anthropic`, `gemini` | Proveedor del LLM para la extracción |
| `AI_API_KEY` | string | Key del proveedor elegido |
| `AI_MAX_TOKENS` | int (default `4096`) | Cap de tokens de respuesta del LLM |
| `AI_CACHE_TTL_SECONDS` | int (default `600`) | TTL del cache in-memory del LLM. `0` desactiva. |
| `AI_MONTHLY_BUDGET_CENTS` | int (default `500`) | Cap mensual de gasto del LLM en centavos USD. |
| `NETLIFY_DB_URL` | string | Auto-provisionada por la extensión Netlify Database (vía `@netlify/database`). El código no la lee directo; `getSql()` la resuelve internamente. |
| `SPOTIFY_CLIENT_ID` | string | OAuth client id de tu app en Spotify Developer |
| `SPOTIFY_CLIENT_SECRET` | string | OAuth client secret. **NUNCA al frontend.** |
| `SPOTIFY_REDIRECT_URI` | url | Debe coincidir exacta con la registrada en Spotify Developer |

## Configurar Spotify

Trama puede registrar lo que escuchas para que luego elijas qué entra a tu trama (nada entra sin tu aprobación explícita).

1. Ve a [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) y crea una app nueva.
2. **Settings → Redirect URIs**: agrega ambas URLs (una para desarrollo, otra para producción):
   - `http://localhost:5173/api/spotify/callback` (dev local)
   - `https://tramadaod.netlify.app/api/spotify/callback` (producción)
3. Copia el **Client ID** y el **Client Secret** a las env vars de Netlify (o tu `.env` local).
4. En `SPOTIFY_REDIRECT_URI`, pon la URL que corresponde al entorno (la de localhost para `.env` local; la de producción para Netlify).
5. Abre Trama → *Configuración* → *Spotify* → *Conectar con Spotify*. Te llevará a la pantalla de consentimiento de Spotify, autoriza, y volverás a Trama conectado.
6. Después: clic en *Sincronizar ahora* para traer tus últimas 50 reproducciones. Las verás en la pestaña **Escuchas** del sidebar, agrupadas por artista, álbum o canción. Decide cuáles agregar a la trama.

Spotify solo retiene las 50 reproducciones más recientes — un sync regular es lo que mantiene el log completo.

**Sync automático cada 3 horas:** la función `netlify/functions/spotify-scheduled-sync.mts` corre 8 veces al día (a las 00, 03, 06, 09, 12, 15, 18, 21 UTC) sin que tengas que hacer nada. La dispara Netlify en sus servidores; tu app puede estar cerrada. Si Spotify no está conectado, la función es un no-op silencioso.

Para cambiar la frecuencia, edita el `schedule` en `spotify-scheduled-sync.mts`. Acepta cualquier cron estándar:
- `0 * * * *` — cada hora
- `0 */6 * * *` — cada 6 horas
- `0 8,20 * * *` — 8 AM y 8 PM UTC
- `@hourly`, `@daily` — atajos de Netlify

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
├── src/                          # frontend
│   ├── App.tsx                   # shell con sidebar + canvas + paneles
│   ├── api.ts                    # cliente HTTP con transforms snake↔camel
│   ├── state.tsx                 # Context aggregator sobre TanStack Query
│   ├── state/                    # hooks por dominio (useEntities, etc.)
│   ├── storage.ts                # localStorage fallback
│   ├── types.ts                  # tipos compartidos
│   ├── hooks/                    # useForceLayout, usePanZoom
│   └── components/               # vistas y paneles
│       └── graph/                # GraphNode, GraphEdge
└── netlify/
    ├── database/migrations/      # SQL versionado, aplicado por Netlify en deploy
    └── functions/                # endpoints serverless
        ├── _lib/                 # llm, extract-prompt, extract-validate
        ├── entities.mts
        ├── relationships.mts
        ├── quotes.mts
        ├── extract.mts           # IA propone, valida, persiste log
        ├── extraction-log.mts
        ├── entity-types.mts
        ├── relationship-types.mts
        ├── search.mts
        ├── export.mts
        └── import.mts
```

## Tests

Vitest con archivos `*.test.ts` co-localizados. CI corre tipos + tests + build en cada push (`.github/workflows/test.yml`).

```bash
npm test           # corre una vez
npm run test:watch # modo watch
```

Coverage actual (zonas críticas):
- `extract-validate.ts`: 100%
- `llm.ts`: ~90%
- `storage.ts`: 74%
- `api.ts`: 70%

Los componentes UI no tienen tests todavía — se cubrirán cuando se agregue React Testing Library.

## Contribuir

Este es un proyecto personal de [Daniel Opazo](https://github.com/DanielOpazoD). No hay procesos formales — si tienes algo que sugerir, abre un issue.
