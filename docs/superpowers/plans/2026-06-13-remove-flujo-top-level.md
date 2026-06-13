# Remove Flujo Top-Level Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `Flujo` as a top-level destination while preserving its editorial workflow as contextual capability inside Trama.

**Architecture:** `ViewMode` stops exposing `flujo`; shell navigation, command search, top bar titles, and router no longer mount it. The existing workflow surface is retitled as an editorial table and becomes a `Recortes` subtab (`?view=recortes&tab=mesa&project=<id>`), so captures, curation, project resume, and reading mode remain available without a new main section.

**Tech Stack:** React, TypeScript, TanStack Query, Vitest, Playwright.

---

### Task 1: Remove Flujo From Shell Navigation

**Files:**

- Modify: `src/types/view.ts`
- Modify: `src/hooks/useInitialView.ts`
- Modify: `src/hooks/useInitialView.test.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/Sidebar.test.tsx`
- Modify: `src/components/MobileBottomNav.tsx`
- Modify: `src/components/MobileBottomNav.test.tsx`
- Modify: `src/hooks/useCommandSearch.ts`
- Modify: `src/components/CommandPaletteItems.tsx`
- Modify: `src/components/TopBar.tsx`
- Modify: `src/components/TopBar.test.tsx`
- Modify: `src/lib/sectionAccent.ts`

- [x] **Step 1: Write the failing tests**

```tsx
// src/hooks/useInitialView.test.tsx
it('ignora ?view=flujo porque Flujo ya no es una vista top-level', () => {
  window.location.search = '?view=flujo'
  const { result } = renderHook(() => useInitialView())
  expect(result.current[0]).toBe('inicio')
})

// src/components/Sidebar.test.tsx
expect(screen.queryByRole('button', { name: /flujo/i })).not.toBeInTheDocument()
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/hooks/useInitialView.test.tsx src/components/Sidebar.test.tsx src/components/MobileBottomNav.test.tsx src/components/TopBar.test.tsx src/components/CommandPalette.test.tsx`

Expected: failures reference the still-present `flujo` view, nav button, or title.

- [x] **Step 3: Remove top-level shell entries**

Delete `flujo` from `ViewMode`, `VALID_VIEWS`, nav items, counts, command search entries, `ViewIcon`, `VIEW_COPY`, and section accent maps.

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/hooks/useInitialView.test.tsx src/components/Sidebar.test.tsx src/components/MobileBottomNav.test.tsx src/components/TopBar.test.tsx src/components/CommandPalette.test.tsx`

Expected: all pass.

### Task 2: Move The Editorial Workflow Into Recortes

**Files:**

- Modify: `src/components/RecortesArea.tsx`
- Modify: `src/components/KnowledgeWorkflowView.tsx`
- Modify: `src/components/KnowledgeWorkflowView.test.tsx`
- Modify: `src/components/HomeProjects.tsx`
- Modify: `src/components/HomeProjects.test.tsx`
- Modify: `src/components/ViewRouter.tsx`
- Modify: `src/components/ViewRouter.test.tsx`

- [x] **Step 1: Write the failing tests**

```tsx
// src/components/HomeProjects.test.tsx
expect(link).toHaveAttribute('href', '/?view=recortes&tab=mesa&project=p1')

// src/components/ViewRouter.test.tsx
renderRouter('recortes')
expect(screen.queryByText(/flujo mock/i)).not.toBeInTheDocument()
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/components/HomeProjects.test.tsx src/components/ViewRouter.test.tsx src/components/KnowledgeWorkflowView.test.tsx`

Expected: Home still deep-links to `view=flujo`, router still has a `flujo` slot, and the workflow still renders copy titled `Flujo`.

- [x] **Step 3: Re-home the workflow**

Add a `mesa` tab in `RecortesArea`, render the existing workflow there, retitle it to `Mesa editorial`, change Home project deep-links to `/?view=recortes&tab=mesa&project=<id>`, and remove the `KnowledgeWorkflowView` lazy route from `ViewRouter`.

- [x] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/components/HomeProjects.test.tsx src/components/ViewRouter.test.tsx src/components/KnowledgeWorkflowView.test.tsx src/components/RecortesView.test.tsx`

Expected: all pass and there is no user-visible `Flujo` destination.

### Task 3: Update Browser Workflow Coverage

**Files:**

- Modify: `e2e/knowledge-workflow.spec.ts`

- [x] **Step 1: Write/update failing E2E intent**

```ts
await page.getByRole('button', { name: 'Recortes' }).click()
await page.getByRole('button', { name: 'Mesa' }).click()
await expect(page.getByRole('heading', { name: 'Mesa editorial' })).toBeVisible()
```

- [x] **Step 2: Run E2E to verify the old path fails**

Run: `npm run e2e -- e2e/knowledge-workflow.spec.ts`

Expected: the old `Flujo` navigation path fails until the Recortes/Mesa route exists.

- [x] **Step 3: Validate full change**

Run: `npm test`, `npm run typecheck`, `npm run check:structure-ratchets`, `npm run check:docs-drift`, `npm run bundle:check`, `npm run build`, and `npm run e2e -- e2e/knowledge-workflow.spec.ts`.

Expected: all checks pass.
