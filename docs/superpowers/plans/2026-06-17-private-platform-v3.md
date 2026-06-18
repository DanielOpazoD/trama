# Plataforma Privada v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Endurecer contratos privados para que mutaciones cross-user o sobre recursos inexistentes no puedan responder éxito silencioso.

**Architecture:** Mantener los handlers Netlify actuales y reforzar su contrato local: cada mutación privada confirma ownership por filas afectadas (`RETURNING`) y responde `ApiErrors.notFound` cuando no tocó filas. Los guardrails existentes de auth/RLS se amplían con un check de drift para soft-delete/restore sin verificación. El smoke operacional pasa a exigir rechazo explícito (`403`/`404`) para mutaciones de B sobre recursos de A.

**Tech Stack:** Netlify Functions, TypeScript, Vitest, Playwright smoke, Postgres/Neon SQL tagged templates.

---

### Task 1: Contrato rojo para mutaciones privadas

**Files:**

- Modify: `netlify/functions/_lib/entities-endpoint.test.ts`
- Modify: `netlify/functions/_lib/quotes-endpoint.test.ts`
- Modify: `netlify/functions/_lib/relationships-endpoint.test.ts`
- Modify: `netlify/functions/_lib/notas-attachments-endpoint.test.ts`
- Modify: `netlify/functions/_lib/utility-endpoints.test.ts`

- [x] Add failing tests for DELETE/restore returning 404 when the SQL mutation returns no rows.
- [x] Verify the focused test pack fails for the new contract.

### Task 2: Handler fixes

**Files:**

- Modify: `netlify/functions/entities.mts`
- Modify: `netlify/functions/quotes.mts`
- Modify: `netlify/functions/relationships.mts`
- Modify: `netlify/functions/notas-attachments.mts`
- Modify: `netlify/functions/chat-threads.mts`
- Modify: `netlify/functions/momentos-feedback.mts`
- Modify: `netlify/functions/saved-queries.mts`
- Modify: `netlify/functions/secrets.mts`

- [x] Change private DELETE/restore paths to `UPDATE ... RETURNING`.
- [x] Return `ApiErrors.notFound` when `RETURNING` returns zero rows.
- [x] For entity cascade CTEs, gate cascades behind the primary row match and surface no-match as 404.

### Task 3: Drift guardrails and smoke v3

**Files:**

- Modify: `netlify/functions/_lib/isolation-guardrail.test.ts`
- Modify: `scripts/smoke-isolation.mjs`
- Modify: `scripts/smoke-isolation.test.mjs`
- Modify: `scripts/ci-p1-guards.test.mjs`
- Modify: `e2e/multi-user-isolation.spec.ts`

- [x] Add a static guardrail against soft-delete/restore SQL on private tables without `RETURNING`.
- [x] Tighten script and E2E smoke so B mutations over A must be rejected (`403`/`404`), not accepted as no-op.
- [x] Keep anonymous `401`, revoked-token, read isolation, and blob isolation checks intact.

### Task 4: Runbook and verification

**Files:**

- Modify: `docs/runbook-multiusuario.md`
- Modify: `docs/deploy.md`
- Modify: `docs/conventions/api.md`
- Modify: `docs/conventions/data.md`

- [x] Document the mutation contract: private 0-row mutation means canonical 404.
- [x] Update production smoke acceptance text.
- [x] Run focused tests, then lint/typecheck/build/check scripts before opening the PR.
