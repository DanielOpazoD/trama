# Hardening Deuda Latente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reducir deuda latente P1/P2/P3 sin crear funcionalidades nuevas: proteger datos, costos, observabilidad, seguridad, constraints, tests y escala.

**Architecture:** Mantener las fronteras actuales de Trama: Netlify Functions con `withObservability`, `getSql()`, `ApiErrors`, transformaciones en `src/api`, y lógica LLM centralizada en `_lib/llm`. Cada bloque debe ser deployable por sí solo y commiteado separado.

**Tech Stack:** React, TypeScript, Netlify Functions, Netlify DB/Postgres, Vitest, Playwright, SQL migrations.

---

### Task 1: Export/import scope hardening

**Files:**

- Modify: `netlify/functions/export.mts`
- Modify: `netlify/functions/import.mts`
- Modify/Test: `netlify/functions/_lib/import-endpoint.test.ts`
- Modify docs if needed: `docs/datos.md`

- [x] Write tests that prove export/import response metadata names the legacy partial scope.
- [x] Implement metadata without changing the existing data payload contract.
- [x] Update data docs so backup limitations name current domains.
- [x] Run focused import/export tests.
- [x] Commit.

### Task 2: LLM rerank cost and observability guardrail

**Files:**

- Modify: `netlify/functions/search.mts`
- Modify: `netlify/functions/_lib/rag-context.ts`
- Modify/Test: `netlify/functions/_lib/search-endpoint.test.ts`
- Modify/Test: `netlify/functions/_lib/ask-endpoint.test.ts`
- Modify/Test: `netlify/functions/_lib/llm-cost-observability.test.ts`

- [x] Write tests showing rerank checks monthly budget and records observable cost where applicable.
- [x] Thread `userId` and `requestId` through rerank callers.
- [x] Keep graceful degradation when rerank fails or AI mode is not ready.
- [x] Run focused LLM/search tests.
- [x] Commit.

### Task 3: Cron observability

**Files:**

- Modify: `netlify/functions/cost-alert-check.mts`
- Modify: `netlify/functions/spotify-scheduled-sync.mts`
- Modify: `netlify/functions/x-scheduled-sync.mts`
- Add/modify tests under `netlify/functions/_lib/*`

- [ ] Add tests for request-id and canonical error behavior on scheduled endpoints.
- [ ] Wrap scheduled handlers with `withObservability`.
- [ ] Preserve per-user best-effort behavior.
- [ ] Run focused cron tests.
- [ ] Commit.

### Task 4: URL preview SSRF hardening and DB constraints validation

**Files:**

- Modify: `netlify/functions/momentos-url-preview.mts`
- Modify/Test: `netlify/functions/_lib/momentos-url-preview-endpoint.test.ts`
- Add: `netlify/database/migrations/<timestamp>_validate_user_fk_constraints/migration.sql`

- [ ] Write tests for redirect/private-IP and DNS resolution behavior.
- [ ] Reduce DNS rebinding exposure without adding a new user-facing feature.
- [ ] Add a new migration that validates existing `NOT VALID` constraints.
- [ ] Run focused URL preview and migration guard tests.
- [ ] Commit.

### Task 5: Coverage, integration smokes, and graph scale

**Files:**

- Modify: `vitest.config.ts`
- Add/modify smoke tests under `netlify/functions/_lib/`
- Modify: `src/components/GraphCanvasSigma.tsx`
- Modify: `src/hooks/useGraphLayout.ts`
- Add/modify graph tests if existing patterns allow.

- [ ] Raise minimum coverage modestly to enforce upward movement.
- [ ] Add real-ish function smoke coverage for auth, Momentos file/upload, export/import, and LLM cost-cap.
- [ ] Replace expensive graph signatures with cheaper revision-style signatures while preserving behavior.
- [ ] Run focused tests, build, full test suite, and bundle check.
- [ ] Commit.

### Task 6: OAuth callback identity hardening

**Files:**

- Modify: `netlify/functions/spotify-callback.mts`
- Modify: `netlify/functions/x-callback.mts`
- Modify/Test: `netlify/functions/_lib/spotify-oauth.test.ts`
- Modify/Test: `netlify/functions/_lib/x-oauth.test.ts`

- [x] Write tests that prove malformed or blank OAuth user cookies redirect instead of 500.
- [x] Decode callback user cookies defensively before setting RLS context.
- [x] Preserve token-save behavior for valid callbacks and skip token exchange/save for invalid identity.
- [x] Run focused Spotify/X OAuth tests.
- [x] Commit.

### Task 7: OAuth cookie transport hardening

**Files:**

- Modify: `netlify/functions/spotify-login.mts`
- Modify: `netlify/functions/x-login.mts`
- Modify/Test: `netlify/functions/_lib/spotify-oauth.test.ts`
- Modify/Test: `netlify/functions/_lib/x-oauth.test.ts`

- [x] Write tests that prove OAuth login cookies include `Secure` when served over HTTPS.
- [x] Add protocol-aware cookie options while preserving local HTTP development.
- [x] Run focused Spotify/X OAuth tests.
- [x] Commit.
