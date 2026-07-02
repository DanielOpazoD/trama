# Knip Baseline Burn-down Pack II Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Knip dead-code baseline without breaking public runtime behavior.

**Architecture:** Keep Knip scoped to real Trama entrypoints, classify remaining exceptions by domain, and only remove code proven unused by repo-wide search plus Knip. Preserve backend/API contracts unless a consumer-facing replacement exists.

**Tech Stack:** Knip 6, Vitest, React/TanStack Query state hooks, existing `scripts/report-quality-gates.mjs` ratchets.

---

### Task 1: Inventory And Ratchet

**Files:**

- Modify: `scripts/developer-quality-gates.test.mjs`
- Modify: `docs/conventions/developer-quality-gates.md`
- Modify: `scripts/quality-gates-baseline.mjs`

- [ ] **Step 1: Write failing ratchet test**

Add a test that forbids keeping removable state hook modules in `knip.json.ignoreIssues`:

```js
test('does not park removable state hook exports in the Knip baseline', () => {
  const config = JSON.parse(readRepoFile('knip.json'))
  const ignoredFiles = Object.keys(config.ignoreIssues ?? {})

  expect(ignoredFiles).not.toContain('src/state/useReadingTables.ts')
  expect(ignoredFiles).not.toContain('src/state/useSavedQueries.ts')
})
```

- [ ] **Step 2: Verify red**

Run:

```bash
npm test -- scripts/developer-quality-gates.test.mjs
```

Expected: FAIL because both state hook files are still in `ignoreIssues`.

### Task 2: Remove Demonstrably Dead State Hooks

**Files:**

- Modify: `src/state/useReadingTables.ts`
- Modify: `src/state/useSavedQueries.ts`
- Modify: `src/state/index.ts`
- Modify: `knip.json`

- [ ] **Step 1: Remove unused hooks only**

Remove `useCreateReadingTable`, `useDeleteReadingTable`, and `useDeleteSavedQuery`. Keep query/update hooks and all backend/API methods intact.

- [ ] **Step 2: Remove obsolete Knip exceptions**

Delete `src/state/useReadingTables.ts` and `src/state/useSavedQueries.ts` from `knip.json.ignoreIssues`.

- [ ] **Step 3: Lower baseline**

Set `QUALITY_GATE_BASELINE.knip.ignoreIssueFiles` to `33` and `ignoreIssueKinds` to `34`.

### Task 3: Document Remaining Exceptions

**Files:**

- Modify: `docs/conventions/developer-quality-gates.md`
- Modify: `scripts/report-quality-gates.mjs`

- [ ] **Step 1: Classify remaining Knip exceptions by domain**

Add explicit domain buckets for API barrels, PDF Studio cross-boundary contracts, shared domain types, state barrels, component-local public types, and operational escape hatches.

- [ ] **Step 2: Make report actionable**

Extend `report:quality-gates` with the domain breakdown so future PRs know which bucket grew.

### Task 4: Validate

**Files:**

- Test: `scripts/developer-quality-gates.test.mjs`

- [ ] **Step 1: Run focused tests**

```bash
npm test -- scripts/developer-quality-gates.test.mjs
npm run check:knip
npm run report:quality-gates
```

- [ ] **Step 2: Run safety gates**

```bash
npm run typecheck
npm test -- scripts/developer-quality-gates.test.mjs src/components/HomeProjects.test.tsx src/components/EditorialProjectPanel.test.tsx src/components/CommandPalette.test.tsx
npm run check:architecture
```
