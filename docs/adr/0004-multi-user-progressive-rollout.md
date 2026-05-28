# ADR-0004: Multi-user gradual sin activar Clerk al primer día

- **Status**: Accepted
- **Date**: 2026-05-26
- **Deciders**: @DanielOpazoD

## Context

Trama nació single-user. La migración a multi-user (Clerk auth + per-user data isolation) tocaba:

- Schema de DB: agregar `user_id` a 8+ tablas, mover de PK simple a `(user_id, ...)`.
- Endpoints: agregar `getAuthedUser()` + `WHERE user_id = ${userId}` en cada query relevante.
- Frontend: incorporar `@clerk/react` con `<ClerkProvider>`, sign-in/sign-out, Bearer token en cada fetch.

Hacer todo en una sola PR sería:

- ~5000 LOC de cambios.
- Imposible de revisar.
- Imposible de hacer rollback parcial si algo rompe.
- Bloquea features nuevas durante el rollout.

## Decision

Migración gradual en 4 fases. Cada una mergea a main, deja la app FUNCIONANDO en single-user, y prepara la siguiente:

1. **Schema multi-user (Tier 1, migration `20260526`)**: agregar `user_id` a todas las tablas como `NOT NULL DEFAULT 'legacy-single-user'`. La row centinela `users.id = 'legacy-single-user'` existe pre-Clerk. La app sigue corriendo sin tocar código.

2. **Endpoints leen userId (Tier C — multi-user infra)**: cada handler agrega `const { id: userId } = await getAuthedUser(req)` y filtra queries por `WHERE user_id = ${userId}`. Mientras Clerk NO esté configurado, `getAuthedUser` devuelve `'legacy-single-user'`. Sin diferencia funcional, pero el código ya está cableado.

3. **Privacidad multi-user (Tier F)**: cerrar gaps de auth en endpoints olvidados (extraction-log, error-log, ai_task_providers). Backfill rows huérfanos. Ahora la app ESTÁ lista para multi-user — solo falta activar.

4. **Activación Clerk** (FUTURO, no en este repo aún): setear `CLERK_SECRET_KEY` + `VITE_CLERK_PUBLISHABLE_KEY`. El frontend monta `<ClerkProvider>`. El backend exige Bearer token. Sin `ALLOW_LEGACY_FALLBACK=true`, los requests sin token devuelven 401.

Entre fase 3 y 4 hay un periodo donde el código backend ya valida tokens si los recibe pero acepta requests sin token. Usamos `ALLOW_LEGACY_FALLBACK=true` como switch para esta transición.

## Consequences

### Positive

- **Cada PR es revisable**: ~500-1500 LOC por fase en lugar de 5000 en una bola.
- **Rollback granular**: si Tier C rompe algo, revertís ESE commit, los anteriores quedan en main.
- **App sigue working durante el rollout**: en single-user con `'legacy-single-user'` la experiencia del usuario no cambia hasta activar Clerk en fase 4.
- **Tests siguen pasando**: cada fase puede agregar tests específicos sin tener que mockear Clerk.

### Negative

- **Más tiempo total**: hacer 4 PRs cuesta más overhead (CI, review, sync) que una sola. Pero baja el riesgo a cambio.
- **Período "incómodo" entre fases**: el código tiene `getAuthedUser()` que devuelve `'legacy-single-user'` siempre. Mirando solo el código uno se confunde — el `userId` parece variable pero en single-user es constante. Mitigamos con comments explícitos.
- **Defaults frágiles**: `NOT NULL DEFAULT 'legacy-single-user'` en migraciones depende de que la row centinela exista. Si alguien borra ese row, INSERTS de nuevos contenidos fallan. Mitigamos en `CLAUDE.md` con "NO borrar la row legacy-single-user".

### Neutral

- La activación final (fase 4) será otra PR. No la planificamos en detalle todavía — depende del momento en que decidamos enable Clerk en producción.

## Alternatives considered

1. **Big bang**: una sola PR. Descartado por inrevisabilidad.
2. **Feature flag con GrowthBook / similar**: activar multi-user via flag dinámico. Overkill — Trama no tiene base de usuarios donde hacer A/B; lo que necesita es deploy gradual, no rollout porcentual.
3. **Branch long-lived `multi-user-v2`**: mantener una rama paralela y mergear al final. Anti-pattern conocido: el merge final se vuelve un infierno de conflicts después de semanas.

## References

- PRs de la migración: #25 (Tier A+B), #26 (Tier C+D+E), #27 (Tier F+H), #28 (Tier J+K).
- `docs/migracion-multi-user.md` — plan operacional detallado.
- `netlify/functions/_lib/auth.ts` — implementación de `getAuthedUser` con tabla de decisión.
