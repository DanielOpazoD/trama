# Stack PR — saneamiento integral multi-user

Este branch acumuló el saneamiento completo para poder validar el sistema de punta a punta.
Para publicarlo, partir en PRs deployables en este orden. Cada PR debe pasar:

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run check:legacy-fallback`
- `git diff --check`
- si toca DB: `scripts/apply-migrations.sh` en DB limpia y segundo run con `Applied 0 new migration(s).`

## PR 1 — Auth, provisioning y aislamiento P0

Incluye `getAuthedUser` en superficies faltantes, `ensureUserRow`, aislamiento de
chat/ask, ownership checks para `quotes`, `relationships`, `momentos`,
compatibilidad temporal en `ai-mode` para cortar el stack sin romper endpoints IA
todavía no migrados, `AI_DISABLED` canónico como dependencia de aislamiento, y
los tests cross-user. No incluye UI visual ni cambios de performance.

Merge si:

- Tests de aislamiento pasan.
- Los endpoints tocados no hacen lecturas/escrituras cross-user.
- Los writes tocados con `user_id` hacen provisioning, salvo taxonomías globales.

## PR 2 — Migración de integridad

Incluye solo la migración nueva `20260531090000_user_fk_integrity` y los ajustes
mínimos de código necesarios para `momento_entities.deleted_at`.

Merge si:

- No se editó ninguna migración aplicada.
- DB limpia aplica todas las migraciones.
- Segundo run aplica 0 migraciones.
- Las constraints FK nuevas existen.

## PR 3 — Costos LLM y observabilidad

Incluye cost-cap por usuario, `extraction_log` en flujos IA, default
`AI_MONTHLY_BUDGET_CENTS=5000`, alertas por usuario y excepción documentada de
embeddings. `AI_DISABLED` canónico queda en PR1 porque `chat/ask` ya necesitan
propagar `userId` a `resolveAIInvocation`.

Merge si:

- Todo endpoint IA generativo llama `checkMonthlyBudget(userId, requestId)`.
- Las respuestas de cap son `429 RATE_LIMITED`.
- Embeddings quedan observables o documentados como excepción.

## PR 4 — API/client correctness

Incluye `apiFetch`, `ApiAuthBridge`, `AuthGate`, debounce estable, guard contra
envíos concurrentes de chat, `parseJsonBody` en
`suggest-relationships` y query keys/invalidation.

Merge si:

- No queda `fetch('/api...')` directo fuera de `src/api/request.ts`.
- Chat streaming conserva Authorization.

## PR 5 — Seguridad externa

Incluye SSRF guard en `momentos-url-preview`, auth en endpoints Wikipedia/preview,
tests para loopback/link-local/RFC1918/IPv6 local, check de fallback legacy en
producción, guard de env Clerk frontend/backend, `netlify.toml` y los scripts npm
necesarios para que el deploy use ese guard.

Merge si:

- Hosts privados se bloquean antes de `fetch`.
- Redirects hacia rangos privados no se siguen.
- `ALLOW_LEGACY_FALLBACK=true` falla en producción.
- Clerk frontend/backend deben configurarse juntos.

## PR 6 — Performance y escala

Incluye `/api/home`, home liviano, `GraphSvgCanvas` con vecinos precalculados,
`graph-neighbors` por `user_id`, y `RelationshipsView` sin descarga wholesale de
entidades.

Merge si:

- Home no necesita descargar entidades/citas/relaciones completas.
- Relaciones paginadas incluyen nombres desde backend.
- Tests puros/componentes cubren el nuevo shape.

## PR 7 — Docs, env y runbooks

Incluye `.env.example`, README, deploy, migraciones, arquitectura, dominios nuevos,
LLM, checklist pre-PR y guardrails finales de aislamiento sobre todo el stack.

Merge si:

- Los comandos documentados existen en `package.json`.
- El cutover Clerk/fallback queda descrito sin contradicciones.
- `AGENTS.md`/`CLAUDE.md` no duplican reglas divergentes.
- El guardrail falla si queda endpoint HTTP sin auth no exento, write con
  `user_id` sin provisioning, JOIN per-user sin scope, o endpoint IA usando el
  fallback legacy de `resolveAIInvocation`/`aiOffResponse`.

## PR 8 — UX/accesibilidad

Incluye focus rings, `touch-target`, tokens semánticos para estados y normalización
de icon sizes. No debe incluir cambios de seguridad o DB.

Merge si:

- No se agrega texto explicativo innecesario en pantalla.
- Los controles mantienen target táctil y foco visible.
- Tests visuales/componentes relevantes siguen verdes.

## Cutover final

Después de mergear el stack:

1. Setear `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` y `LEGACY_OWNER_CLERK_ID`.
2. Confirmar login E2E en deploy real.
3. Setear presupuesto por usuario o aceptar fallback `AI_MONTHLY_BUDGET_CENTS`.
4. Dejar `ALLOW_LEGACY_FALLBACK` apagado en producción.
5. Correr smoke test autenticado: Home, Chat, crear cita, crear relación, crear Momento, preview URL, X/Spotify si aplica.
