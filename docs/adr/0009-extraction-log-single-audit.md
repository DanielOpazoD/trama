# ADR-0009: `extraction_log` como single audit log para llamadas LLM

- **Status**: Accepted
- **Date**: 2026-05-27
- **Deciders**: @DanielOpazoD

## Context

La app llama a LLMs desde varios endpoints distintos (`extract`, `ask`, `chat-messages`, `proactive-suggestions`, `quote-reflect`, `reclassify-entities`, `suggest-relationships`, `extract-from-image`, `spotify-library-snapshot`, `spotify-suggest-artists`, `search` con rerank opcional).

Para cada llamada necesitamos saber:

- **Cuánto costó**: tokens in/out + costCents para el cost-cap mensual.
- **Cuánto tardó**: durationMs para SLO tracking.
- **Quién la hizo**: user_id para multi-user accounting.
- **Qué pidió**: input_text para debugging y replay.
- **Qué devolvió**: proposal en jsonb para auditoría y posible re-aplicación.
- **Si falló**: error message + provider/model contexto.

Opciones para persistir:

1. **Tabla por endpoint**: `extract_log`, `ask_log`, `chat_log`, etc. Cada handler escribe en su propia tabla.
2. **Tabla única**: `extraction_log` con un discriminador en `input_text` o un nuevo campo `endpoint`. Todos los handlers escriben acá.

## Decision

**Una sola tabla `extraction_log`** con la siguiente shape mínima:

```sql
CREATE TABLE extraction_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_text      TEXT NOT NULL,        -- prefijo + payload (ej. "chat:thread-abc", "extract", "image:image/png")
  proposal        JSONB NOT NULL,       -- shape libre, depende del endpoint
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  tokens_in       INTEGER NOT NULL DEFAULT 0,
  tokens_out      INTEGER NOT NULL DEFAULT 0,
  cost_cents      NUMERIC(10, 4) NOT NULL DEFAULT 0,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  accepted_ids    TEXT[] NOT NULL DEFAULT '{}',  -- futuro: tracking de aceptación
  error           TEXT,                          -- llenado si falla
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  user_id         TEXT REFERENCES users(id)      -- multi-user (Tier F)
);
```

El discriminador del endpoint vive en `input_text` con un prefijo convencional:

- `extract` puro → `input_text` = el texto del usuario
- `ask:<view>` → `ask` desde la AskBar
- `chat:<threadId>` → `chat-messages` streaming
- `reflect:<quoteId>` → quote reflect
- `proactive-suggestions` → batch de sugerencias
- `reclassify-entities` → cambio de tipos
- `suggest-relationships` → discover rels
- `image:<mimeType>` → extract-from-image
- `spotify:palette` → library-snapshot

`/api/extraction-log` GET filtra por user_id y devuelve los últimos N para Settings → Logs.

`/api/health` agrega por provider + sumiza para el panel de costos.

## Consequences

### Positive

- **Una sola query para el cost-cap**: `SUM(cost_cents) FROM extraction_log WHERE user_id = ? AND created_at >= date_trunc('month', NOW())`. Implementado en `_lib/cost-cap.ts`.
- **Análisis cross-endpoint trivial**: "¿cuánto gasté en chat vs extract en marzo?" es un GROUP BY sobre el prefijo del input_text. Si dividiéramos por tabla, sería un UNION ALL feo.
- **Backups simples**: una tabla a respaldar/migrar en lugar de N.
- **Append-only por diseño**: no se editan rows ni se borran (solo CASCADE de user_id si Clerk decommissiona). Eso simplifica retention y permite particionar por created_at en el futuro.

### Negative

- **Schema laxo**: `proposal jsonb` y `input_text TEXT` significan que cada endpoint puede meter lo que quiera. Si alguien meter el password del user en `input_text`, queda en logs. Mitigamos con code review + el comment del schema.
- **Index del prefix**: para queries "todos los `ask:*` del mes" hay que hacer `WHERE input_text LIKE 'ask:%'` que no usa índice eficiente. Si en el futuro queremos analíticas frecuentes por endpoint, agregar columna `endpoint TEXT` separada (futura migration).
- **Privacy concerns**: el `input_text` contiene literalmente lo que el usuario tipea en chat/extract. Si se exporta el extraction_log a un soporte externo, hay PII. Por eso `/api/extraction-log` GET requiere auth + filtra por user_id desde el Tier F.

### Neutral

- `extraction_log` está en la lista de tablas **exentas de soft delete** ([ADR-0003](./0003-soft-delete-everywhere.md)) — es append-only. La única forma de "borrarla" es CASCADE de su parent (user).

## Alternatives considered

1. **Tabla por endpoint**: descartado por la fricción de queries cross-endpoint.
2. **Datadog / Sentry para LLM tracking**: SaaS dedicado (Langfuse, Helicone). Útil cuando el volume crece. Hoy single-user, low volume — overkill. Documentado como "futuro" en `docs/observability.md`.
3. **Column `endpoint`**: separada del input_text. Ya lo evalué; lo agregamos cuando una query analítica frecuente lo justifique. Por ahora prefijo en input_text con convención.

## References

- Migration original: `netlify/database/migrations/20260518100000_extraction_log/migration.sql`.
- `netlify/functions/_lib/cost-cap.ts` — SUM sobre extraction_log filtrado.
- `netlify/functions/extraction-log.mts` — GET con auth + per-user filter.
- [ADR-0003: soft delete everywhere](./0003-soft-delete-everywhere.md) — extraction_log queda exenta (append-only).
