# Legacy Identity & Media Cutover Evidence Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PR that turns legacy identity/media compatibility into auditable cutover evidence, with read-only reports, scoped fallback guardrails, HealthPanel guidance, tests, and docs.

**Architecture:** Keep data migration as evidence only: no row updates, no blob copies, no deletes. Move policy into pure helpers and checkers so CI can freeze the allowed legacy media fallback surface while UI and docs explain the next cutover action.

**Tech Stack:** Node scripts, Vitest, React/TanStack Query, Netlify Functions, Netlify Blobs, Postgres via existing `getSql()`/RLS patterns.

---

### Task 1: Legacy Dry-Run Readiness Evidence

**Files:**

- Modify: `scripts/legacy-data-reassignment-dry-run.mjs`
- Modify/Test: `scripts/legacy-data-reassignment-dry-run.test.mjs`

- [ ] **Step 1: Write failing tests**

```ts
it('clasifica readiness de cutover con target faltante y revision manual', () => {
  const report = summarizeDryRun({
    database: evaluateTableInventoryRows(
      [
        { table_name: 'notes', legacy_rows: 2 },
        { table_name: 'notas_attachments', legacy_rows: 1 },
      ],
      [
        { table: 'notes', lifecycle: 'soft-delete', reason: 'private notes' },
        {
          table: 'notas_attachments',
          lifecycle: 'soft-delete',
          reason: 'attachment metadata',
        },
      ],
    ),
    blobs: {
      storesChecked: 1,
      totalKeys: 2,
      totalLegacyUnscopedKeys: 1,
      warnings: [],
      stores: [
        summarizeBlobInventory({
          storeName: 'notas-attachments',
          blobs: [{ key: 'legacy-photo.png' }, { key: 'user_real/photo.png' }],
        }),
      ],
    },
    targetUserId: null,
  })

  expect(report.cutoverReadiness.status).toBe('blocked')
  expect(report.cutoverReadiness.blockers).toEqual(
    expect.arrayContaining([
      'target_user_id_missing',
      'manual_review_required',
      'legacy_unscoped_blobs_present',
    ]),
  )
})
```

- [ ] **Step 2: Run RED**

Run: `npm test -- scripts/legacy-data-reassignment-dry-run.test.mjs`
Expected: FAIL because `cutoverReadiness` does not exist.

- [ ] **Step 3: Implement pure readiness summary**

Add `deriveCutoverReadiness()` and include `cutoverReadiness` in `summarizeDryRun()`. Keep the script read-only and privacy-preserving.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- scripts/legacy-data-reassignment-dry-run.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/legacy-data-reassignment-dry-run.mjs scripts/legacy-data-reassignment-dry-run.test.mjs
git commit -m "feat(legacy): summarize cutover readiness evidence"
```

### Task 2: Client Media Fallback Boundary

**Files:**

- Create: `src/components/momentos/authenticatedMediaModel.ts`
- Create/Test: `src/components/momentos/authenticatedMediaModel.test.ts`
- Modify: `src/components/momentos/AuthenticatedMedia.tsx`
- Modify/Test: `src/components/momentos/AuthenticatedMedia.test.tsx`

- [ ] **Step 1: Write failing tests**

```ts
it('permite fallback sin auth solo para Momentos legacy', () => {
  expect(
    shouldRetryLegacyMediaWithoutAuth(
      '/api/momentos-file/legacy-single-user/foto.jpg',
      notFound,
    ),
  ).toBe(true)
  expect(
    shouldRetryLegacyMediaWithoutAuth('/api/momentos-file/foto-vieja.jpg', notFound),
  ).toBe(true)
  expect(
    shouldRetryLegacyMediaWithoutAuth('/api/momentos-file/user_real/foto.jpg', notFound),
  ).toBe(false)
  expect(
    shouldRetryLegacyMediaWithoutAuth('/api/notas-attachments-file/foto.jpg', notFound),
  ).toBe(false)
})
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/components/momentos/authenticatedMediaModel.test.ts src/components/momentos/AuthenticatedMedia.test.tsx`
Expected: FAIL because the model file does not exist.

- [ ] **Step 3: Extract helpers**

Move `shouldFetchWithApiClient` and `shouldRetryLegacyMediaWithoutAuth` into the model file and keep `AuthenticatedMedia` behavior unchanged.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- src/components/momentos/authenticatedMediaModel.test.ts src/components/momentos/AuthenticatedMedia.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/momentos/authenticatedMediaModel.ts src/components/momentos/authenticatedMediaModel.test.ts src/components/momentos/AuthenticatedMedia.tsx src/components/momentos/AuthenticatedMedia.test.tsx
git commit -m "refactor(media): freeze legacy fallback classification"
```

### Task 3: Legacy Media Fallback Guardrail

**Files:**

- Create: `scripts/check-legacy-media-fallbacks.mjs`
- Create/Test: `scripts/check-legacy-media-fallbacks.test.mjs`
- Modify: `package.json`
- Modify: `scripts/script-registry.mjs`

- [ ] **Step 1: Write failing tests**

```ts
it('rechaza fetch sin auth fuera de AuthenticatedMedia', () => {
  const result = checkLegacyMediaFallbacks({
    files: {
      'src/components/momentos/AuthenticatedMedia.tsx':
        'fetch(src, { signal, headers: {} })',
      'src/components/Other.tsx':
        'fetch("/api/momentos-file/legacy.jpg", { headers: {} })',
    },
  })
  expect(result.ok).toBe(false)
})
```

- [ ] **Step 2: Run RED**

Run: `npm test -- scripts/check-legacy-media-fallbacks.test.mjs`
Expected: FAIL because checker does not exist.

- [ ] **Step 3: Implement checker and npm script**

Allow only the existing `AuthenticatedMedia` fallback and fail on new unauthenticated `/api/momentos-file` fetches elsewhere.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- scripts/check-legacy-media-fallbacks.test.mjs && npm run check:legacy-media-fallbacks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/check-legacy-media-fallbacks.mjs scripts/check-legacy-media-fallbacks.test.mjs package.json scripts/script-registry.mjs
git commit -m "test(media): guard legacy fallback surface"
```

### Task 4: HealthPanel Cutover Evidence

**Files:**

- Modify: `src/api/health.ts`
- Modify/Test: `src/components/settings/healthPanelModel.ts`
- Modify/Test: `src/components/settings/healthPanelModel.test.ts`
- Modify: `src/components/settings/HealthPanel.tsx`
- Modify: `src/components/settings/HealthPanelSections.tsx`
- Modify/Test: `src/components/settings/HealthPanel.test.tsx`
- Modify/Test: `netlify/functions/health.mts`
- Modify/Test: `netlify/functions/_lib/health-endpoint.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it('deriva checklist de cutover legacy accionable', () => {
  expect(buildLegacyCutoverChecklist(healthWithStrictClerk)).toContainEqual(
    expect.objectContaining({ code: 'strict_auth', status: 'ok' }),
  )
})
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/components/settings/healthPanelModel.test.ts src/components/settings/HealthPanel.test.tsx netlify/functions/_lib/health-endpoint.test.ts`
Expected: FAIL because checklist/field is missing.

- [ ] **Step 3: Add operational command and UI checklist**

Expose `legacyDataReassignmentCommand` in `operational`, add pure `buildLegacyCutoverChecklist()`, and render a compact section in HealthPanel.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- src/components/settings/healthPanelModel.test.ts src/components/settings/HealthPanel.test.tsx netlify/functions/_lib/health-endpoint.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/health.ts src/components/settings/healthPanelModel.ts src/components/settings/healthPanelModel.test.ts src/components/settings/HealthPanel.tsx src/components/settings/HealthPanelSections.tsx src/components/settings/HealthPanel.test.tsx netlify/functions/health.mts netlify/functions/_lib/health-endpoint.test.ts
git commit -m "feat(health): surface legacy cutover evidence"
```

### Task 5: Runbooks and Final Validation

**Files:**

- Modify: `docs/migracion-multi-user.md`
- Modify: `docs/storage-orphans.md`
- Modify: `docs/conventions/client-api-contracts.md`

- [ ] **Step 1: Update docs**

Document the dry-run report, manual-review states, legacy media fallback boundary, and what remains intentionally non-automated.

- [ ] **Step 2: Run required validation**

Run:

```bash
npm run typecheck
npm run build
npm run check:architecture
npm run check:structure-ratchets
npm run check:user-id-writes
npm run check:storage-boundaries
npm run check:client-api-contracts
npm run check:api-error-shape
npm run bundle:check
npm run check:legacy-media-fallbacks
```

- [ ] **Step 3: Commit and publish**

```bash
git add docs/migracion-multi-user.md docs/storage-orphans.md docs/conventions/client-api-contracts.md
git commit -m "docs(legacy): document media cutover evidence"
git push -u origin codex/legacy-media-cutover-evidence-pack
gh pr create --title "Legacy Identity & Media Cutover Evidence Pack" --body-file /tmp/legacy-media-cutover-pr.md
```
