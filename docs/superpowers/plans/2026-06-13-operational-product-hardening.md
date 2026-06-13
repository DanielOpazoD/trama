# Operational Product Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single ambitious PR, `codex/operational-product-hardening`, with six serial commits that reduce structural debt, improve multi-user cutover safety, make Health actionable, guide Recortes curation, prevent documentation drift, and expand UX/a11y guardrails.

**Architecture:** Keep changes incremental and guardrail-driven. Prefer small pure helpers, static regression tests, and existing UI/API patterns over large rewrites. Avoid schema changes unless explicitly needed; all behavior must preserve RLS, soft-delete, CTE atomicity, and existing endpoint contracts.

**Tech Stack:** React 18, TypeScript, TanStack Query, Netlify Functions `.mts`, Vitest, Playwright, Node scripts, Tailwind.

---

### Task 1: Structure Headroom

**Files:**

- Modify: `src/App.tsx`
- Create: `src/hooks/useAppModals.ts`
- Create: `src/hooks/useAppModals.test.tsx`
- Modify: `src/components/GraphView.tsx`
- Create: `src/components/graph/useGraphHoverPreview.ts`
- Create: `src/components/graph/useGraphHoverPreview.test.tsx`
- Modify: `scripts/structure-ratchets.mjs`

- [ ] Write tests for modal state and graph hover timeout cleanup.
- [ ] Run focused tests and verify they fail before implementation.
- [ ] Extract `useAppModals()` and `useGraphHoverPreview()`.
- [ ] Lower or add ratchets for touched surfaces where useful.
- [ ] Run focused tests plus `npm run check:structure-ratchets`.
- [ ] Commit: `Extract app and graph state helpers`.

### Task 2: Multi-User Cutover Hardening

**Files:**

- Modify: `netlify/functions/health.mts`
- Modify: `src/api/health.ts` or equivalent health transform file
- Modify: `src/components/settings/HealthPanel.tsx`
- Test: health endpoint/unit tests and HealthPanel tests

- [ ] Add tests proving Health exposes auth/cutover warnings.
- [ ] Implement `authStatus`/alert fields without weakening auth.
- [ ] Surface a visible Health alert when fallback is enabled.
- [ ] Run focused tests.
- [ ] Commit: `Surface multi-user cutover health`.

### Task 3: Health Actions

**Files:**

- Modify: `src/components/settings/HealthPanel.tsx`
- Modify: `src/components/settings/LogsPanel.tsx` if needed
- Test: `src/components/settings/HealthPanel.test.tsx`

- [ ] Add tests for copying diagnostic text and visible remediation actions.
- [ ] Implement “copiar diagnostico” using current Health payload.
- [ ] Link existing embedding warning copy to the existing reindex/search area without adding new server jobs.
- [ ] Run focused tests.
- [ ] Commit: `Make health alerts actionable`.

### Task 4: Guided Recortes Curation

**Files:**

- Modify: `src/components/recortes/*`
- Modify: `src/components/RecortesView.tsx` if needed
- Test: `src/components/RecortesView.test.tsx` or recortes component tests

- [ ] Add tests for pending-first guided curation copy and available actions.
- [ ] Improve the pending Recortes surface around existing suggest/promote flows.
- [ ] Avoid automatic mutation: suggestions remain advisory.
- [ ] Run focused tests.
- [ ] Commit: `Guide recortes curation flow`.

### Task 5: Docs Drift as Code

**Files:**

- Modify: `scripts/check-docs-drift.mjs`
- Modify: `scripts/check-docs-drift.test.mjs`
- Modify: `README.md`

- [ ] Add tests that fail when README function counts drift from the filesystem.
- [ ] Implement the docs drift check using discovered Netlify function count.
- [ ] Update README stale endpoint/function references.
- [ ] Run `npm run check:docs-drift` and focused script tests.
- [ ] Commit: `Check docs drift against function count`.

### Task 6: UX/A11y Expansion

**Files:**

- Modify: `e2e/a11y.spec.ts`
- Modify: `e2e/fixtures.ts` if needed
- Test: Playwright a11y spec

- [ ] Add a11y coverage for Settings/Health and Recortes surfaces.
- [ ] Keep axe scopes focused to reduce flake.
- [ ] Run the targeted Playwright a11y spec.
- [ ] Commit: `Expand a11y coverage`.

### Final Verification and PR

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run check:structure-ratchets`.
- [ ] Run `npm run check:docs-drift`.
- [ ] Run `npm run bundle:check`.
- [ ] Push `codex/operational-product-hardening`.
- [ ] Open draft PR against `main`.
