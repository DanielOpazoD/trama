# ADR-0005: `ai_task_providers (user_id, task)` para config LLM per-user

- **Status**: Accepted
- **Date**: 2026-05-27
- **Deciders**: @DanielOpazoD

## Context

La app tiene 7 tareas distintas que llaman a un LLM: `extract`, `extract-image`, `suggest-relationships`, `reclassify`, `reflect`, `chat`, `panel`. Cada una puede usar un provider distinto (DeepSeek por costo, Anthropic por chat quality, OpenAI por vision, etc.) y un modelo distinto dentro del provider.

La tabla `ai_task_providers (task, provider, model, verify_with)` mapeaba 1:1 task → config. Funcionó en single-user.

Cuando se migra a multi-user, dos opciones:

1. **Catálogo global**: todos los users comparten la config de tareas. Si el admin elige `deepseek` para `extract`, todos los users usan deepseek.
2. **Per-user**: cada user tiene su propia config. User A puede usar OpenAI, user B Anthropic.

## Decision

PK compuesto `(user_id, task)` en `ai_task_providers`. Cada user tiene su propia config. Si un user no tiene row para una task, el código cae al env var `AI_PROVIDER`.

Cambios cableados:

- Migration `20260526000000_multi_user_schema`: agregó `user_id NOT NULL DEFAULT 'legacy-single-user'`, dropó PK simple, agregó PK compuesto.
- `_lib/ai-tasks.ts`: `loadAll(userId)` y `resolveTaskProvider(task, userId)` filtran por user_id.
- `_lib/ai-mode.ts`: `resolveAIInvocation(req, task, userId)` propaga el userId.
- Cache per-user con `Map<userId, UserCache>` y `invalidateAITaskCache(userId)`.
- `/api/ai-settings` GET/PUT requiere auth, filtra/upsert con user_id.

## Consequences

### Positive

- **Privacidad de configuración**: si en el futuro Trama agrega usuarios, cada uno puede elegir su provider sin afectar al resto. Si user A prefiere Anthropic Sonnet por calidad de chat, user B puede seguir con DeepSeek por costo — sin coordinación.
- **Defaults razonables**: cuando un user nuevo no tiene rows, `resolveTaskProvider` devuelve provider vacío, y el caller cae al env default. No hace falta inicializar rows al crear el user.
- **Compatible con costo per-user**: combinado con `users.monthly_budget_cents` y la suma de gasto filtrada por user, cada user es responsable de su gasto.

### Negative

- **Cache duplicado**: el `Map<userId, ...>` en memoria de la function instance puede crecer si tenemos muchos users activos. Aceptable hasta ~10k users. Si se vuelve memoria-bound, migrar a un LRU con cap.
- **`resolveTaskProvider` ahora requiere userId**: si un caller olvida pasarlo, default es `'legacy-single-user'` (definido en signature). Eso significa que un bug donde el userId no se propaga termina compartiendo config con legacy — silencioso. Mitigamos en code review.
- **Forced mode global**: el header `X-AI-Mode: forced:openai` sigue siendo global por sesión, no per-task. Si user A fuerza OpenAI, ALL sus tasks van a OpenAI durante esa sesión. Decisión deliberada: forced es para debugging/A-B, no para configuración persistente.

### Neutral

- En modo single-user (Clerk no activo), todos los rows tienen `user_id = 'legacy-single-user'`. La config sigue siendo "global" funcionalmente. No hay regresión.

## Alternatives considered

1. **Catálogo global**: descartado porque pierde la flexibilidad multi-user.
2. **Híbrido (global default + per-user override)**: agregar un row con `user_id = '__default__'` que se aplica si el user no tiene su propio row. Más complejidad por poco beneficio — el env var ya cumple ese rol.
3. **Per-user en JSON jsonb dentro de `users`**: en lugar de tabla separada, almacenar `users.ai_config jsonb`. Más fácil de leer (una sola query) pero peor para invalidación granular (cambiar el provider de `chat` re-escribe todo el jsonb).

## References

- ADR-0004 (multi-user progressive rollout)
- Migration `20260526000000_multi_user_schema/migration.sql` — sección 4 `ai_task_providers: widen PK from (task) to (user_id, task)`
- PR #27 `chore: Tier F (privacidad multi-user) + Tier H (estructura)` — F2 implementa la lectura/escritura per-user.
