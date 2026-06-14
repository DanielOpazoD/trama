# Motor de queries componibles (Fase 1)

`POST /api/query` ejecuta queries estructuradas y componibles sobre los objetos
de Trama (`entity`, `quote`, `momento`, `note`), filtrando por tipo, fecha,
tags y texto, combinando condiciones con `and`/`or`/`not`. Es el motor base
sobre el que se construirán las queries guardadas, los bloques embebibles y el
traductor lenguaje-natural→AST.

## Arquitectura

```
cliente → POST /api/query (AST JSON)
            → Zod valida (ast.ts)
            → compile.ts: AST → SQL parametrizado (whitelist field-registry)
            → execute.ts: tagged template (RLS) → hits + cursor keyset
```

- **`_lib/query/ast.ts`** — esquema Zod del AST (predicados, combinadores, sort,
  límite, cursor). Una query es un objeto serializable, no SQL.
- **`_lib/query/field-registry.ts`** — whitelist `(kind, field) → {sql, tipo,
ops}` + metadata por kind (tabla, FTS, tags, proyección). **Única fuente** de
  identificadores SQL.
- **`_lib/query/builder.ts`** — `SqlBuilder` que acumula `parts`+`values` (no
  string crudo) para pasar al tagged template del cliente RLS.
- **`_lib/query/compile.ts`** — compilador puro AST→SQL.
- **`_lib/query/execute.ts`** — ejecuta y normaliza; arma el cursor keyset.
- **`query.mts`** — endpoint (`withObservability` + `getAuthedUser` + Zod).

## El AST

```jsonc
{
  "from": ["entity", "note"], // tipos a consultar (1..4)
  "where": {
    // opcional
    "or": [
      { "field": "type", "op": "eq", "value": "persona" },
      { "field": "tags", "op": "has_any", "value": ["work"] },
    ],
  },
  "sort": { "field": "created_at", "dir": "desc" }, // default
  "limit": 25, // 1..100, default 25
  "cursor": "…", // keyset opaco de la respuesta anterior
}
```

**Predicados:** `eq`/`neq`/`lt`/`lte`/`gt`/`gte`/`between`/`in` (sobre campos del
registry), `tags has_any`/`has_all`, y `matches` (texto libre: FTS por
`websearch_to_tsquery` donde hay `search_vector`, `ILIKE` donde no).

**Combinadores:** `{and:[...]}`, `{or:[...]}`, `{not:...}` (profundidad ≤ 6).

**Cross-tipo:** un campo que no aplica a un kind compila a `FALSE` para ese kind
(p.ej. `year` en `note`), así una query con `or` sobre varios tipos es
intuitiva.

## Campos por tipo

| Kind    | Campos consultables                                 | Texto (`matches`) | tags | props |
| ------- | --------------------------------------------------- | ----------------- | ---- | ----- |
| entity  | `type`, `name`, `year`, `origin_kind`, `created_at` | search_vector     | sí   | sí    |
| quote   | `entity_id`, `pinned`, `origin_kind`, `created_at`  | search_vector     | sí   | sí    |
| momento | `kind`, `captured_at`, `origin_kind`, `created_at`  | search_vector     | sí   | sí    |
| note    | `pinned`, `created_at`                              | content (ILIKE)   | sí   | sí    |

Campos de texto admiten además `contains` (ILIKE).

## Fase 2 — propiedades, tags unificados y `linked_to`

Migración `20260614040000_object_properties_tags`: agrega `properties JSONB` +
`tags TEXT[]` (con índices GIN) a `entities`/`quotes`/`momentos` (notes ya tenía
tags). Esto habilita:

- **Propiedades de usuario** (`prop:<key>`): filtrar por claves arbitrarias de
  `properties`. La clave se valida por formato (`[a-z0-9_]`) y va como parámetro
  (`properties ->> $key`); ops `eq`/`neq`/`in`/`contains` + `exists`
  (`jsonb_exists`). Ej: `{ "field": "prop:team", "op": "eq", "value": "marketing" }`.
- **Tags unificados**: `tags has_any`/`has_all` ahora aplica a todos los kinds.
- **`linked_to`**: objetos vinculados a una entidad —
  `{ "op": "linked_to", "id": "<uuid>" }`. Por kind: quote→`entity_id`,
  momento→`momento_entities`, entity→`relationships` (en ambas direcciones);
  note no se vincula → FALSE.

### Escritura: `PATCH /api/object-properties`

```jsonc
{
  "kind": "entity",
  "id": "<uuid>",
  "setProps": { "team": "marketing" }, // merge
  "unsetProps": ["old"], // borra claves
  "setTags": ["a", "b"],
} // reemplaza tags
```

Parametrizado y bajo RLS (sólo afecta filas del propio usuario). Las claves se
validan por formato en el schema Zod (`_lib/object-properties.ts`).

> **Diferido a Fase 2.5:** registro `property_defs` (catálogo tipado de
> propiedades por tipo de objeto) para alimentar la UI y el traductor
> lenguaje-natural→AST. El motor ya consulta cualquier clave; el registro es
> sólo catálogo.

## Seguridad

El compilador es la superficie crítica:

- Los nombres de tabla/columna/op salen **solo** del whitelist; lo desconocido
  no se puede consultar (op inválido para un campo → 400).
- **Todo valor del usuario va como parámetro** (`$n`), nunca interpolado — los
  tests cubren intentos de inyección.
- Se ejecuta vía **tagged template** del cliente RLS (`getSql()`), que envuelve
  cada llamada en una transacción que setea `app.current_user_id`. Un string
  crudo con `.query()` saltearía RLS; por eso `builder.ts` produce
  `parts`+`values`.
- Profundidad de condición acotada (anti-DoS); `limit` ≤ 100.

## Tests

- `compile.test.ts` — unit del compilador (estructura, combinadores, tags/FTS,
  cross-tipo, cursor, validación de ops, anti-inyección).
- `query-endpoint.test.ts` — endpoint con SQL mockeado (200, 405, 400).
- `query.integration.test.ts` — **Postgres real**: rango, cross-tipo OR, FTS y
  **aislamiento RLS** entre usuarios. Guarded por `QUERY_IT_DB_URL` (job
  `migrations` de CI / `npm run db:up`). `npm run test:query-it`.

## Fase 3 — lenguaje natural → AST ("pregúntale a tu Trama")

`POST /api/query/nl { q }` traduce una pregunta en lenguaje natural a un AST y
lo ejecuta. Devuelve `{ query, items, nextCursor, source }` — incluye el **AST
interpretado** para que la UI lo muestre/edite (la "live update view").

- **Catálogo data-driven** (`_lib/query/nl.ts` → `buildCatalogText`): al LLM se
  le pasa la lista de kinds/campos/ops/`prop:`/`linked_to` derivada del
  field-registry + los `entity_types` + la fecha de hoy (para rangos relativos
  como "el mes pasado"). Así el modelo sólo referencia campos que el compilador
  acepta.
- **Validación + reparación:** la salida del LLM se valida con el mismo
  `QueryBody` (Zod); si falla, hay **un intento de reparación** (re-prompt con el
  error). Si vuelve a fallar, o si la IA está off / sin presupuesto, **cae a una
  búsqueda de texto libre** (`matches` sobre todos los tipos) — el usuario
  siempre recibe resultados.
- Mismos guards que el resto: `checkMonthlyBudget` + `resolveAIInvocation`
  (tarea `classify`). El traductor (`translateNl`) recibe el `ask` inyectado →
  testeable con LLM mockeado y contra Postgres real.

## Roadmap

- **Fase 1 (hecha):** AST + compilador + endpoint + filtros tipo/fecha/tags/texto.
- **Fase 2 (hecha):** propiedades de usuario (`prop:<key>`), tags unificados,
  `linked_to`, escritura vía `/api/object-properties`.
- **Fase 3 (hecha):** traductor lenguaje-natural→AST (`/api/query/nl`) con
  catálogo data-driven, reparación y fallback de texto libre.
- Fase 2.5: registro `property_defs` (catálogo tipado) + read-model `objects`
  (proyección denormalizada) para escala.
- Fase 4: queries guardadas (`saved_queries`) + bloques embebibles + UI con
  preview en vivo.
- Fase 1.5: predicado semántico `near` (pgvector) integrado al motor.
