# Trama — Arquitectura

Documento vivo de decisiones. Cada bloque de mejoras lo actualiza.

## Visión del producto

Mapa cognitivo personal de afinidades intelectuales y estéticas. La cara visible es **un grafo**; el motor es una **IA que estructura texto desordenado** en nodos y relaciones que el usuario revisa y confirma.

Tres pilares:
1. **Visualización primero.** El producto es el grafo, no los formularios.
2. **IA como escribano, humano como curador.** El usuario aporta texto bruto; la IA propone estructura; el usuario decide qué entra.
3. **Persistencia en la nube, durabilidad en décadas.** Diseñado para ser usable a lo largo de 10+ años, con respaldo exportable en cualquier momento.

## Stack técnico

| Capa | Elección | Por qué |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind | Vita rápido, TS para seguridad de tipos, Tailwind para iterar estética sin CSS suelto |
| Hosting | Netlify | El usuario ya tiene cuenta Pro, despliegues automáticos en push a `main` |
| Backend | Netlify Functions (serverless) | Cero servidor que mantener, escala automática, idéntico stack TS que el frontend |
| Base de datos | Netlify Database (Postgres serverless via Neon) | Provisionado por Netlify, gratis hasta julio 2026 luego por créditos de uso real |
| Driver Postgres | `@neondatabase/serverless` | Cliente liviano (1 paquete sin árbol de transitives), tagged template literals con parametrización segura |
| Grafo | SVG con layout force-directed casero | Cero dependencias, suficiente hasta ~100 nodos. A migrar a `xyflow` o `sigma.js` si crece |
| LLM | Abstracción multi-proveedor: DeepSeek por defecto, OpenAI/Anthropic/Gemini swappables vía env var | El modelo cambia cada 6 meses; la capa de invocación no debería |
| Sync local | localStorage como fallback offline | Temporal; migrar a CRDTs (Yjs) cuando se use en múltiples dispositivos |

## Estructura del repositorio

```
trama/
├── ARCHITECTURE.md          ← este archivo
├── netlify.toml             ← config de build y functions
├── package.json
├── src/                     ← frontend React
│   ├── App.tsx              ← shell con sidebar + canvas + paneles
│   ├── main.tsx             ← entry point
│   ├── types.ts             ← tipos compartidos (Entity, Relationship, Quote, Origin, Proposal)
│   ├── api.ts               ← cliente HTTP con transforms snake_case ↔ camelCase
│   ├── state.tsx            ← React Context con estado + acciones CRUD
│   ├── storage.ts           ← fallback a localStorage cuando no hay backend
│   ├── index.css            ← Tailwind base + custom components (input-paper, btn-ink)
│   └── components/
│       ├── Sidebar.tsx           ← navegación + colapsable
│       ├── GraphView.tsx         ← SVG + force layout + drag/pan/zoom
│       ├── ExtractBar.tsx        ← textarea flotante inferior
│       ├── ProposalPanel.tsx     ← panel derecho cuando IA devuelve propuesta
│       ├── NodeDetailPanel.tsx   ← panel derecho cuando se selecciona un nodo
│       ├── EntitiesView.tsx      ← lista alterna + formulario manual
│       ├── QuotesView.tsx
│       └── RelationshipsView.tsx
└── netlify/
    ├── database/
    │   └── migrations/<timestamp>_<slug>/migration.sql
    └── functions/
        ├── _lib/
        │   ├── llm.ts                ← abstracción multi-proveedor (DeepSeek, OpenAI, Anthropic, Gemini)
        │   └── extract-prompt.ts     ← prompt para extracción semántica
        ├── entities.mts              ← GET/POST/PATCH/DELETE /api/entities[/:id]
        ├── relationships.mts
        ├── quotes.mts
        ├── extract.mts               ← POST /api/extract — IA propone estructura desde texto
        ├── export.mts                ← GET /api/export — dump JSON completo
        └── import.mts                ← POST /api/import — restaura desde dump
```

## Modelo de datos

Tres tablas centrales conectadas:

```
entities (1) ─── (∞) relationships ─── (1) entities
        │
        └── (∞) quotes
```

### Convenciones de columnas

Cada tabla incluye:
- `id UUID PRIMARY KEY` — generado por DB (`gen_random_uuid()`)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — inmutable
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — actualizado por trigger en cada UPDATE
- `deleted_at TIMESTAMPTZ NULL` — soft delete (las queries filtran por `WHERE deleted_at IS NULL`)
- `origin JSONB NOT NULL DEFAULT '{"kind": "manual"}'` — procedencia estructurada (ver abajo)

### El campo `origin`

JSONB con esta forma mínima:
```json
{ "kind": "manual" }
```

O cuando viene de la IA:
```json
{
  "kind": "ai",
  "provider": "deepseek",
  "model": "deepseek-chat",
  "extractionLogId": "uuid-del-log-de-extraccion"
}
```

JSONB porque: (a) flexible para agregar campos sin migración, (b) consultable con operadores `->`, `->>`, `@>`, (c) preparado para nuevas fuentes futuras (`imported`, `pdf`, `voice`, etc.).

### Eliminación en cascada

Si una entidad se soft-deletea (`deleted_at` se setea), también se soft-deletean sus relaciones (entrantes y salientes) y sus citas. Esto se hace en la Netlify Function `DELETE /api/entities/:id` con tres UPDATE en secuencia.

## Decisiones clave y por qué

### Por qué `origin` es JSONB y no enum

Hoy solo distingue manual vs IA. Mañana queremos saber qué modelo, qué prompt, qué fuente original. El enum forzaría una migración SQL cada vez. JSONB no.

### Por qué snake_case en SQL y camelCase en JS

Convención dominante de cada ecosistema. En vez de quotear identificadores en SQL o nombrar variables raras en JS, se hace transformación explícita en `api.ts` — la frontera está en un solo archivo.

### Por qué un layout force-directed casero en vez de xyflow

El entorno local tiene problemas SSL al instalar paquetes nuevos del registry de npm, que bloquearon `@xyflow/react`. El layout casero (~50 líneas, Fruchterman-Reingold) funciona limpio hasta ~100 nodos. Si la trama crece más allá de eso, migrar a `xyflow` o `sigma.js` es un swap localizado en `GraphView.tsx`.

### Por qué localStorage como fallback en vez de error duro

Permite trabajar local sin desplegar el backend. Es un fallback de un solo sentido (no sube a la nube cuando recuperas conexión) — temporal hasta migrar a un modelo local-first real con CRDTs.

### Por qué Netlify Database (Neon) y no Supabase, Turso, etc.

Provisionado automáticamente al hacer deploy si el proyecto lo necesita. No requiere cuentas externas. Plan Pro de Netlify incluye uso gratuito hasta cierto volumen. El driver `@neondatabase/serverless` es estándar y portable — migrar a otro Postgres es solo cambiar `NETLIFY_DATABASE_URL`.

## Cómo desplegar

1. Push a `main` en GitHub.
2. Si el sitio Netlify está conectado al repo, deploy automático.
3. En primer deploy: Netlify detecta migraciones nuevas y las aplica antes de servir.
4. Variables de entorno requeridas en Netlify:
   - `AI_PROVIDER` — `deepseek` (default) | `openai` | `anthropic` | `gemini`
   - `AI_API_KEY` — key del proveedor elegido
   - `NETLIFY_DATABASE_URL` — autoprovisionada por Netlify Database

## Cómo aplicar una migración

1. Crear directorio: `netlify/database/migrations/<unix_timestamp>_<slug>/migration.sql`
2. Escribir SQL (idempotente cuando sea posible: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... IF NOT EXISTS`).
3. Push a `main`. Netlify aplica antes del próximo build.
4. Las migraciones aplicadas son inmutables — no editar, siempre agregar nuevas.

## Testing

Vitest corre tests con `npm test`. Configuración en `vitest.config.ts`.

### Convenciones

- Tests **colocados** con su código: `foo.ts` → `foo.test.ts` en la misma carpeta.
- Patrones incluidos: `src/**/*.test.ts` y `netlify/**/*.test.ts`.
- Sin globals (`globals: false`): cada test importa `describe, it, expect, vi` de `vitest`.
- Mocks de fetch/Netlify.env con `vi.stubGlobal`, limpieza en `afterEach`.

### Qué se testea hoy

| Archivo | Cobertura | Qué cubre |
|---|---|---|
| `src/api.ts` | 70% | Transformación snake_case ↔ camelCase, normalización de `origin` legacy, request shape de POST/PATCH, manejo de errores HTTP |
| `src/storage.ts` | 74% | Carga de localStorage con normalización de shapes viejos, round-trip save/load, tolerancia a JSON corrupto |
| `netlify/functions/_lib/llm.ts` | 91% | Dispatch correcto por proveedor (DeepSeek/OpenAI/Anthropic/Gemini), headers y body shape por API, parsing de respuestas, manejo de errores y env vars faltantes |
| `netlify/functions/_lib/extract-validate.ts` | 100% | Validación de tipo de entidad y relación, dedup case-insensitive contra entidades existentes, rechazo de self-loops, manejo de input malformado (null, string, array, shape incorrecto) |

Componentes React y `state.tsx` no tienen tests todavía — se cubrirán cuando se descompongan en hooks/sub-componentes (Bloques 3 y 4).

### CI

`.github/workflows/test.yml` corre en cada push y PR a `main`:
1. `npm ci`
2. `npm run typecheck` (tsc -b)
3. `npm test`
4. `npm run build`

Una falla en cualquier paso bloquea el merge (o sería visible como check rojo si las branch protections están activas).

## Bloques de mejora pendientes

Ver el plan en la conversación / TodoWrite. A 2026-05-18:
- ✅ Bloque 0: docs base
- ✅ Bloque 1: durabilidad de esquema + portabilidad
- ✅ Bloque 2: red de seguridad de tests
- ⏳ Bloque 3: TanStack Query + descomponer estado
- ⏳ Bloque 4: descomponer GraphView
- ⏳ Bloque 5: log de extracción + costos
- ⏳ Bloque 6: tipos como datos
- ⏳ Bloque 7: búsqueda full-text
- ⏳ Bloque 8: LLM resiliente
- ⏳ Bloque 9: accesibilidad
- ⏳ Bloque 10: docs finales

Última revisión: 2026-05-18
