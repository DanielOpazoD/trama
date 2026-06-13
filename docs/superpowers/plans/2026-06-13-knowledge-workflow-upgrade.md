# Knowledge Workflow Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new Trama workflow surface that turns pending captures, suggestions, notes, and tasks into a curated reading workbench, narrative proposal, and exportable editorial draft.

**Architecture:** Keep this PR front-end first and migration-free. Add pure model helpers in `src/lib/knowledgeWorkflow.ts` and `src/lib/editorialDraft.ts`, then compose them in a lazy `KnowledgeWorkflowView` that reads existing query hooks. Store the temporary workbench in localStorage so it is useful immediately without new database tables.

**Tech Stack:** React, TanStack Query hooks already exposed by `src/state`, localStorage hook patterns, Vitest/RTL, Playwright, existing Trama design tokens.

---

## File Structure

- Create `src/lib/knowledgeWorkflow.ts`: pure inbox normalization, priority scoring, counts, and source labels.
- Create `src/lib/knowledgeWorkflow.test.ts`: red/green coverage for inbox ordering and counts.
- Create `src/lib/editorialDraft.ts`: pure narrative proposal and Markdown export helpers.
- Create `src/lib/editorialDraft.test.ts`: red/green coverage for proposal and export shape.
- Create `src/hooks/useKnowledgeWorkbench.ts`: localStorage-backed selected item ids.
- Create `src/hooks/useKnowledgeWorkbench.test.tsx`: hook persistence and toggle behavior.
- Create `src/components/KnowledgeWorkflowView.tsx`: top-level "Flujo" UI, combining inbox, workbench, proposal, and export.
- Create `src/components/KnowledgeWorkflowView.test.tsx`: component behavior with mocked state hooks.
- Modify `src/types/view.ts`, `src/components/ViewRouter.tsx`, `src/components/Sidebar.tsx`, `src/components/MobileBottomNav.tsx`, `src/lib/sectionAccent.ts`, `src/components/TopBar.tsx`, `src/components/CommandPaletteItems.tsx` as needed to expose the new view consistently.
- Modify `e2e/fixtures.ts` and add `e2e/knowledge-workflow.spec.ts` for a full workflow smoke.

## Task 1: Knowledge Inbox Model

**Files:**

- Create: `src/lib/knowledgeWorkflow.ts`
- Test: `src/lib/knowledgeWorkflow.test.ts`

- [ ] **Step 1: Write failing model tests**

Add tests that call:

```ts
buildKnowledgeInbox({
  recortes: [
    {
      id: 'r1',
      status: 'pending',
      text: 'Recorte central',
      sourceTitle: 'Ensayo',
      createdAt: '2026-06-12T10:00:00Z',
    },
  ],
  suggestions: [
    {
      id: 's1',
      kind: 'relationship',
      title: 'Conectar Borges',
      createdAt: '2026-06-12T11:00:00Z',
    },
  ],
  notes: [
    {
      id: 'n1',
      content: 'Idea larga para revisar',
      pinned: true,
      promotedMomentoId: null,
      createdAt: '2026-06-12T09:00:00Z',
    },
  ],
  tasks: [
    {
      id: 't1',
      title: 'Escribir borrador',
      priority: 'alta',
      dueDate: '2026-06-13',
      createdAt: '2026-06-12T08:00:00Z',
    },
  ],
})
```

Expect four normalized items sorted by priority: high-priority task, proactive suggestion, pending recorte, pinned note. Expect counts by source and an urgency label.

- [ ] **Step 2: Run model tests red**

Run `npm test src/lib/knowledgeWorkflow.test.ts`.
Expected: failure because the module does not exist.

- [ ] **Step 3: Implement minimal model**

Define `KnowledgeInboxItem`, `KnowledgeWorkflowInput`, `buildKnowledgeInbox`, `knowledgeInboxCounts`, and deterministic score rules:

- task: `alta` + due date = highest
- suggestion = high
- pending recorte = medium-high
- pinned unpromoted note = medium
- archived/promoted recortes and done tasks are excluded

- [ ] **Step 4: Run model tests green**

Run `npm test src/lib/knowledgeWorkflow.test.ts`.

- [ ] **Step 5: Commit**

Commit: `Add knowledge workflow inbox model`

## Task 2: Workflow View Shell and Inbox

**Files:**

- Create: `src/components/KnowledgeWorkflowView.tsx`
- Test: `src/components/KnowledgeWorkflowView.test.tsx`
- Modify: `src/components/ViewRouter.tsx`

- [ ] **Step 1: Write failing component tests**

Mock `useRecortesQuery`, `useProactiveQuery`, `useNotesQuery`, and `usePendingTasks`. Render `KnowledgeWorkflowView`.

Assert:

- heading `Flujo`
- inbox item from pending recorte
- proactive suggestion row
- empty state when all sources are empty
- button `añadir a mesa` exists for inbox items

- [ ] **Step 2: Run tests red**

Run `npm test src/components/KnowledgeWorkflowView.test.tsx`.
Expected: module missing or heading missing.

- [ ] **Step 3: Implement shell**

Use `ViewHeader` with title `Flujo`, subtitle explaining it is a processing surface, and `buildKnowledgeInbox` over existing hook data. Render three columns/sections inside the existing max-width scroll container:

- `Inbox de conocimiento`
- `Mesa de lectura`
- `Borrador editorial`

Only Task 2 needs inbox and empty state; later tasks fill workbench/proposal/export.

- [ ] **Step 4: Run tests green**

Run `npm test src/components/KnowledgeWorkflowView.test.tsx`.

- [ ] **Step 5: Commit**

Commit: `Surface knowledge workflow inbox`

## Task 3: Reading Workbench

**Files:**

- Create: `src/hooks/useKnowledgeWorkbench.ts`
- Test: `src/hooks/useKnowledgeWorkbench.test.tsx`
- Modify: `src/components/KnowledgeWorkflowView.tsx`
- Test: `src/components/KnowledgeWorkflowView.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Assert the hook:

- starts empty
- toggles ids
- removes ids
- clears all
- persists under key `trama:knowledge-workbench:v1`

- [ ] **Step 2: Run hook tests red**

Run `npm test src/hooks/useKnowledgeWorkbench.test.tsx`.

- [ ] **Step 3: Implement hook**

Use `useState` with localStorage read/write guards. Export `toggleItem`, `removeItem`, `clear`, and `isSelected`.

- [ ] **Step 4: Integrate view and write/extend component test**

Click `añadir a mesa`; expect item appears under `Mesa de lectura` with `quitar` and `vaciar mesa`.

- [ ] **Step 5: Run tests green**

Run `npm test src/hooks/useKnowledgeWorkbench.test.tsx src/components/KnowledgeWorkflowView.test.tsx`.

- [ ] **Step 6: Commit**

Commit: `Add reading workbench`

## Task 4: Narrative Proposal

**Files:**

- Create: `src/lib/editorialDraft.ts`
- Test: `src/lib/editorialDraft.test.ts`
- Modify: `src/components/KnowledgeWorkflowView.tsx`
- Test: `src/components/KnowledgeWorkflowView.test.tsx`

- [ ] **Step 1: Write failing pure tests**

Given two workbench items, assert `buildNarrativeProposal` returns:

- a thesis string containing the strongest source title/text
- three outline sections
- gaps mentioning missing entities or missing quotes when applicable

- [ ] **Step 2: Run pure tests red**

Run `npm test src/lib/editorialDraft.test.ts`.

- [ ] **Step 3: Implement deterministic proposal helper**

No LLM call in this PR. Generate a local proposal from selected item titles, source kinds, and notes.

- [ ] **Step 4: Integrate into view**

When the workbench has items, show `Propuesta narrativa`, `Tesis provisional`, `Estructura`, and `Huecos a revisar`.

- [ ] **Step 5: Run tests green**

Run `npm test src/lib/editorialDraft.test.ts src/components/KnowledgeWorkflowView.test.tsx`.

- [ ] **Step 6: Commit**

Commit: `Generate narrative proposals`

## Task 5: Editorial Markdown Export

**Files:**

- Modify: `src/lib/editorialDraft.ts`
- Test: `src/lib/editorialDraft.test.ts`
- Modify: `src/components/KnowledgeWorkflowView.tsx`
- Test: `src/components/KnowledgeWorkflowView.test.tsx`

- [ ] **Step 1: Write failing export tests**

Assert `buildEditorialMarkdown` includes:

- `# Borrador desde Trama`
- `## Tesis provisional`
- `## Materiales`
- item source labels and excerpts
- `## Huecos a revisar`

- [ ] **Step 2: Run export tests red**

Run `npm test src/lib/editorialDraft.test.ts`.

- [ ] **Step 3: Implement export helper**

Keep it pure and deterministic. Do not include private tokens, ids in headings, or raw JSON.

- [ ] **Step 4: Add copy button**

In the view, add `copiar Markdown` using `navigator.clipboard.writeText`. Show `Markdown copiado` as `role="status"`.

- [ ] **Step 5: Run tests green**

Run `npm test src/lib/editorialDraft.test.ts src/components/KnowledgeWorkflowView.test.tsx`.

- [ ] **Step 6: Commit**

Commit: `Export editorial drafts`

## Task 6: Navigation, E2E, and PR

**Files:**

- Modify: `src/types/view.ts`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/MobileBottomNav.tsx`
- Modify: `src/components/ViewRouter.tsx`
- Modify: `src/lib/sectionAccent.ts`
- Modify: `src/components/TopBar.tsx`
- Modify: `src/components/CommandPaletteItems.tsx`
- Modify: `e2e/fixtures.ts`
- Create: `e2e/knowledge-workflow.spec.ts`

- [ ] **Step 1: Write failing router/sidebar tests**

Extend existing tests to assert view `flujo` can render and appears in navigation.

- [ ] **Step 2: Run tests red**

Run focused tests for `ViewRouter`, `Sidebar`, and `TopBar` as modified.

- [ ] **Step 3: Wire the view**

Add slug `flujo`, nav label `Flujo`, lazy route to `KnowledgeWorkflowView`, accent color, and command palette target. Add it to mobile nav only if layout remains stable; otherwise desktop + command palette are enough for this PR.

- [ ] **Step 4: Add E2E smoke**

Mock `/api/recortes`, `/api/proactive-suggestions`, `/api/notes`, and `/api/tasks` with one item each. Navigate to `Flujo`, add two items to mesa, verify proposal appears, copy Markdown.

- [ ] **Step 5: Run focused checks**

Run:

```bash
npm test src/lib/knowledgeWorkflow.test.ts src/lib/editorialDraft.test.ts src/hooks/useKnowledgeWorkbench.test.tsx src/components/KnowledgeWorkflowView.test.tsx
npm run e2e -- e2e/knowledge-workflow.spec.ts
```

- [ ] **Step 6: Commit**

Commit: `Wire knowledge workflow navigation`

- [ ] **Step 7: Final verification and PR**

Run:

```bash
npm run typecheck
npm test
npm run check:structure-ratchets
npm run check:docs-drift
npm run build
npm run bundle:check
npm run e2e -- e2e/knowledge-workflow.spec.ts
```

Push `codex/knowledge-workflow-upgrade` and open a draft PR titled `[codex] Knowledge workflow upgrade`.

## Self-Review

- Spec coverage: the six requested blocks map to model/inbox, curation surface, workbench, narrative proposal, export, and guardrail/E2E tasks.
- Placeholder scan: no task is left as TBD; each task has files, red test, implementation target, verification, and commit.
- Scope check: no SQL migration or new server endpoint is required; the feature uses existing data sources and localStorage.
- Ambiguity check: IA proposals in this PR are deterministic local proposals, not paid LLM calls. Future LLM drafting can build on the workbench contract.
