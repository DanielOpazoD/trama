# ADR-0001: Neon HTTP serverless en lugar de connection pool

- **Status**: Accepted
- **Date**: 2026-05-15
- **Deciders**: @DanielOpazoD

## Context

Trama corre en Netlify Functions (FaaS de Netlify, Node 22 ESM). Cada invocación es una lambda fresca (puede haber cold-start; un mismo proceso puede manejar varios requests en warm-state).

Opciones para conectarse a Postgres:

1. Cliente Postgres tradicional con connection pool (`pg.Pool`, `postgres.js`). Mantiene N conexiones abiertas, reutiliza entre requests del mismo container.
2. Cliente HTTP de Neon (`@neondatabase/serverless` / `@netlify/database`). Cada query es un POST HTTPS a Neon's HTTP endpoint. Sin pool, sin conexión persistente.

Postgres por default solo tolera ~100 conexiones concurrentes. Si tenemos pool en serverless donde N containers pueden abrir N conexiones cada uno, podemos saturar el max_connections fácil.

## Decision

Usamos el cliente HTTP de Neon (`@netlify/database` que expone `httpClient`). Cada query es un POST HTTPS independiente. No mantenemos pool de conexiones.

## Consequences

### Positive

- **No hay límite de connections**: el HTTP gateway de Neon multiplexa internamente. Podemos tener 1000 containers en paralelo sin que se sature Postgres.
- **Cold-start friendly**: una lambda nueva no paga el costo de establecer una conexión TCP — el HTTP request es un round-trip simple.
- **Simplicidad operacional**: nada de "¿se cerró el pool?", "¿quién mantiene las conexiones idle?", "¿qué pasa si Postgres recicla?". El HTTP es stateless por diseño.
- **Compatible con tagged templates**: la API `sql\`SELECT ... ${value}\``se siente igual que`pg.Pool`.

### Negative

- **Latencia adicional**: ~5-15ms por query vs ~0.5-2ms con conexión persistente. Para queries chicas, el overhead es notable. Para queries complejas (chat-messages con joins), el costo de la query domina sobre el de la conexión.
- **No transactions cross-query**: cada query es independiente; no podés hacer `BEGIN; ... ; COMMIT;` con queries separadas. Hay que usar CTE / un solo `WITH` o aceptar inconsistencia eventual. (Para Trama, los flujos críticos caben en una sola query.)
- **Lock-in a Neon**: si en el futuro queremos migrar a Aurora / Supabase, hay que reemplazar el cliente. El SQL es portable pero el adapter no.

### Neutral

- El cliente HTTP no expone tipos de las queries — necesitamos `as unknown as Row[]` en cada call site. Ver [ADR-0009 (futuro)](./0009-sql-typed-helper.md) para el plan de mitigarlo con un helper.

## Alternatives considered

1. **Connection pool + PgBouncer**: la solución "clásica". Requiere infra adicional (PgBouncer en algún VPS), y el setup en serverless es frágil. Descartado por complejidad operacional.
2. **Cliente nativo con `pg.Pool({ max: 1 })`**: limitar el pool a 1 conexión por container. Funciona pero pierde el beneficio del pool (reuse) y suma latencia de connect en cada cold start.
3. **Drizzle ORM / Prisma**: agregan tipado pero el principal problema (connection saturation en serverless) sigue. Drizzle tiene un driver Neon HTTP, viable como capa encima del cliente actual. No lo adoptamos hoy para no agregar capas; reevaluar si el `as unknown as` se vuelve insostenible.

## References

- [Neon: serverless drivers](https://neon.tech/docs/serverless/serverless-driver)
- [Netlify: Neon integration](https://docs.netlify.com/storage/netlify-db/)
