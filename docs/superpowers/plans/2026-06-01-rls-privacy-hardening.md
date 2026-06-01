# RLS Privacy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Row Level Security branch deployable by ensuring protected SQL receives a transaction-local user context before `FORCE ROW LEVEL SECURITY` can affect production tables.

**Architecture:** Keep the existing endpoint SQL mostly unchanged. `getSql()` will return a small RLS-aware wrapper around the Netlify/Neon HTTP client; when request auth has resolved a user, every query is executed in a transaction that first sets `app.current_user_id`. Public scheduled/callback paths get explicit system or user context instead of relying on accidental visibility.

**Tech Stack:** Netlify Functions, Neon HTTP transactions, Postgres RLS, TypeScript, Vitest guardrails.

---

### Task 1: RLS-Aware SQL Client

**Files:**

- Modify: `netlify/functions/_lib/user-rls.ts`
- Modify: `netlify/functions/_lib/db.ts`
- Modify: `netlify/functions/_lib/auth.ts`
- Test: `netlify/functions/_lib/user-rls.test.ts`

- [x] Write tests for transaction wrapping and missing context behavior.
- [x] Add request-local RLS context helpers and wrap SQL tagged-template calls.
- [x] Make `getAuthedUser()` register the resolved user id in the request context.
- [x] Run focused RLS tests.

### Task 2: Public Scheduled And OAuth Context

**Files:**

- Modify: `netlify/functions/cost-alert-check.mts`
- Modify: `netlify/functions/spotify-callback.mts`
- Modify: `netlify/functions/spotify-scheduled-sync.mts`
- Modify: `netlify/functions/x-callback.mts`
- Modify: `netlify/functions/x-scheduled-sync.mts`
- Test: `netlify/functions/_lib/isolation-guardrail.test.ts`

- [x] Require public auth-exempt functions to declare either user RLS context or system RLS bypass.
- [x] Add context calls to OAuth callbacks after signed cookie user id validation.
- [x] Add system bypass context to scheduled jobs that intentionally aggregate across users.
- [x] Run focused guardrail tests.

### Task 3: Migration Safety

**Files:**

- Modify: `netlify/database/migrations/20260601100000_enable_user_rls/migration.sql`
- Test: `netlify/functions/_lib/isolation-guardrail.test.ts`

- [x] Keep `ENABLE` + `FORCE ROW LEVEL SECURITY` for private tables.
- [x] Allow only transaction-local `app.rls_bypass = 'system'` or matching `app.current_user_id`.
- [x] Verify every private table remains listed in the RLS migration.

### Task 4: Verification

**Files:**

- No production files unless verification exposes a real failure.

- [x] Run `node_modules/.bin/vitest run netlify/functions/_lib/user-rls.test.ts netlify/functions/_lib/isolation-guardrail.test.ts`.
- [x] Run `npm run typecheck`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Run `npm run format:check` and `npm run check:docs-drift`.
- [ ] Apply the RLS migration against real Postgres/Netlify. Local `npm run db:up` needs Docker, which was not available in this workstation.
- [ ] Report exact status and remaining risks before PR/merge.
