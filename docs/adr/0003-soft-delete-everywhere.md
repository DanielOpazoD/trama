# ADR-0003: Soft delete consistente en todas las tablas de dominio

- **Status**: Accepted
- **Date**: 2026-05-15
- **Deciders**: @DanielOpazoD

## Context

Trama maneja entidades del usuario (entities, relationships, quotes, momentos, chat_threads) que el user puede "eliminar". Dos modelos posibles:

1. **Hard delete**: `DELETE FROM entities WHERE id = ?`. La row desaparece. Si el user se arrepiente, no hay deshacer.
2. **Soft delete**: `UPDATE entities SET deleted_at = NOW() WHERE id = ?`. La row queda. Queries de lectura agregan `WHERE deleted_at IS NULL`. El delete se puede revertir con `UPDATE SET deleted_at = NULL`.

La app tiene un toast "Deshacer" después de cada delete con 6 segundos para revertir. Sin soft delete, "deshacer" significa "re-crear" — pierde el id, los timestamps, las relaciones cascadeadas.

## Decision

Soft delete en TODAS las tablas de dominio:

- `entities`, `relationships`, `quotes`, `momentos`, `chat_threads`, `proactive_suggestions` — todas tienen `deleted_at TIMESTAMPTZ` nullable.
- Cada SELECT que lee data viva agrega `WHERE deleted_at IS NULL`.
- Cada handler DELETE hace `UPDATE SET deleted_at = NOW()`, jamás `DELETE FROM`.
- **Cascadeo**: si borrás una entidad, también soft-deleteamos sus relaciones y citas (tres UPDATEs en el handler).
- Tablas append-only quedan exentas: `chat_messages`, `spotify_plays`, `extraction_log`, `error_log` — la única forma de "borrarlas" es CASCADE de su parent (thread/user).

## Consequences

### Positive

- **Undo nativo**: el toast "Deshacer" hace `UPDATE deleted_at = NULL`. El id, timestamps y relaciones se preservan exactamente.
- **Audit trail**: si después de 3 meses el user pregunta "¿qué borré?", tenemos los rows con `deleted_at`.
- **Foreign keys intactas**: si tengo `relationship.from_id → entities.id` y borro la entity, hard delete rompería la FK. Soft delete deja la FK valid; el filter `WHERE deleted_at IS NULL` en el SELECT excluye la row.
- **Compliance friendlier**: GDPR exige "right to be forgotten" — sería un hard delete explícito separado. Soft delete deja la opción de tener ambos modos (default soft, forget hard).

### Negative

- **Storage crece**: rows borrados se acumulan. En single-user con bajo throughput es despreciable; en multi-user activo habría que considerar un GC periódico (`DELETE FROM ... WHERE deleted_at < NOW() - INTERVAL '90 days'`).
- **Queries son levemente más lentas**: el filter `WHERE deleted_at IS NULL` agrega un predicate. Para mitigarlo, todos los índices relevantes usan `WHERE deleted_at IS NULL` como partial index (ej. `idx_entities_user_active`).
- **Riesgo de olvido**: si un dev escribe `SELECT * FROM entities WHERE user_id = ?` sin agregar `AND deleted_at IS NULL`, expone rows borrados. Mitigación: en `CLAUDE.md` está como regla; en code review se chequea; eventualmente podemos agregar una vista `entities_active` que ya filtra.

### Neutral

- "Soft delete cascade" no es transactional (3 UPDATEs separados). En el unlikely caso de un crash en el medio, queda en estado inconsistente. Aceptable porque (a) muy raro, (b) el chequeo con `deleted_at IS NULL` no rompe nada visible.

## Alternatives considered

1. **Hard delete + tabla `audit_log` separada**: separar la concern del audit del modelo de delete. Más complejidad (escribir a 2 tablas en cada delete). Y "deshacer" requeriría re-construir desde audit log — pierde la simplicidad.
2. **Hard delete + bin temporal**: mover la row a una tabla `*_deleted` antes de borrar. Permite cleanup automático pero duplica el esquema.
3. **Soft delete con flag boolean (`is_deleted`) en lugar de timestamp**: pierde el "cuándo se borró" que es valioso para correlación. Y un timestamp ocupa lo mismo que un boolean.

## References

- Migration original: `20260518000000_initial_schema/migration.sql`
- Comment en `CLAUDE.md` → "Soft delete, no hard delete" como regla fundamental.
