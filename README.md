# Trama

Mapa cognitivo personal de afinidades intelectuales y estéticas.

Una webapp donde escribes texto desordenado sobre lo que estás leyendo, escuchando o pensando — y una IA extrae entidades (personas, libros, conceptos, canciones…) y las conecta entre sí. El producto es un **grafo** que crece con el tiempo: tu propia constelación de influencias.

## Stack

- **Frontend:** React 18 + Vite + TypeScript + Tailwind
- **Backend:** Netlify Functions (Node 22, ESM)
- **Database:** Netlify Database (Postgres serverless de Neon)
- **LLM:** DeepSeek por defecto, con abstracción multi-proveedor (OpenAI, Anthropic, Gemini)
- **Tests:** Vitest

Ver [`ARCHITECTURE.md`](./ARCHITECTURE.md) para el detalle de decisiones y modelo de datos.

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
| `NETLIFY_DATABASE_URL` | string | Auto-provisionada por Netlify Database |

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
