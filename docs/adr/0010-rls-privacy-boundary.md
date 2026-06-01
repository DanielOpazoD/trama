# ADR-0010: RLS como segunda barrera de privacidad, no cero-conocimiento

- **Status**: Accepted
- **Date**: 2026-06-01
- **Deciders**: @DanielOpazoD

## Context

Trama ya filtra por `user_id` en los endpoints multi-user, pero ese control vivía
principalmente en código de aplicación. Eso protege contra bugs obvios, pero no
contra una query nueva que olvida el filtro, ni contra un refactor que use un
helper compartido de forma ambigua.

Además, Netlify Functions usa el cliente HTTP de Neon. Ese cliente no conserva
sesión entre queries sueltas, así que cualquier política RLS basada en
`current_setting(...)` necesita que el contexto de usuario se setee dentro de la
misma transacción que la query protegida.

## Decision

Activamos Row Level Security en las tablas privadas con `ENABLE ROW LEVEL
SECURITY` y `FORCE ROW LEVEL SECURITY`. La política permite leer/escribir solo
cuando:

- `user_id = current_setting('app.current_user_id', true)`, o
- el request declara explícitamente `app.rls_bypass = 'system'` para jobs
  internos que deben iterar múltiples usuarios.

`getSql()` devuelve un wrapper RLS-aware. Después de `getAuthedUser()`,
`auth.ts` registra el usuario en un `AsyncLocalStorage`; cada query del cliente
SQL se ejecuta en una transacción que primero hace
`set_config('app.current_user_id', userId, true)`.

Los cron jobs y callbacks OAuth que no pasan por `getAuthedUser()` deben declarar
su contexto explícito:

- `setCurrentRlsUser(userId)` cuando el userId viene de una cookie HttpOnly del
  flow OAuth.
- `runWithSystemRls(...)` cuando el job necesita operar sobre todos los usuarios.

## Security boundary

Este modelo es aislamiento fuerte de aplicación + base de datos. No es
cero-conocimiento.

Garantiza:

- una Function autenticada no debería poder cruzar datos entre usuarios por una
  query olvidada;
- un endpoint sin contexto RLS queda sin visibilidad sobre tablas privadas cuando
  RLS esté aplicado;
- los jobs multi-user tienen bypass explícito, auditable y acotado al bloque de
  ejecución.

No garantiza:

- confidencialidad frente al dueño de infraestructura con acceso directo a
  Neon, Netlify Blobs, variables de entorno o logs;
- cifrado extremo a extremo de textos, imágenes, notas de voz o embeddings;
- protección contra código malicioso deployado con credenciales runtime de
  producción.

Si algún día Trama requiere que ni el admin de infraestructura pueda leer datos,
la arquitectura correcta es otra: cifrado cliente-side/E2E, gestión de llaves,
recuperación de cuenta compatible con privacidad, búsqueda limitada o índices
cifrados, y una UX explícita para pérdida de llaves.

## Consequences

### Positive

- RLS pasa a ser una defensa de base de datos, no solo disciplina de endpoints.
- Los tests pueden fallar si una tabla privada queda fuera de la migración RLS.
- Los caminos excepcionales (`system` y callbacks OAuth) quedan nombrados en
  código, no escondidos en permisos globales.

### Negative

- Cada query protegida se envuelve en una transacción para setear contexto local;
  hay overhead de latencia que conviene observar en endpoints calientes.
- Los tests unitarios no reemplazan aplicar la migración contra Postgres real.
  `npm run db:up` requiere Docker y debe correrse en un entorno que lo tenga.
- El bypass `system` es poderoso: solo debe usarse en crons internos o tareas
  operativas que realmente agregan/iteran por usuario.

### Neutral

- Seguimos manteniendo `legacy-single-user` para la data histórica de Daniel.
  Producción estricta depende de Clerk configurado y `ALLOW_LEGACY_FALLBACK`
  apagado.

## References

- `netlify/functions/_lib/user-rls.ts`
- `netlify/functions/_lib/db.ts`
- `netlify/functions/_lib/auth.ts`
- `netlify/database/migrations/20260601100000_enable_user_rls/migration.sql`
- `docs/migracion-multi-user.md`
