# Hotspot Structure Burn-down Pack

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development for behavior changes and keep this checklist updated as blocks land.

**Goal:** Lower structural debt in near-limit Trama hotspots without changing product behavior: move orchestration into narrow hooks/models, keep UI shells thin, add focused regression tests, and tighten structure ratchets only where the split is proven.

**Non-goals:** No ORM change, no domain redesign, no broad visual refresh, no applied migration edits, no hard-delete semantics changes.

**Current hotspot targets:**

- `src/components/CommandPalette.tsx`
- `src/components/commandPalette/useCommandPaletteController.ts`
- `src/components/commandPalette/commandPaletteSelectionModel.ts`
- `src/components/settings/DataPanel.tsx`
- `netlify/functions/_lib/llm/dispatch.ts`
- PDF Studio surfaces where extraction is low-risk

## Block 1: CommandPalette Controller Split

- [x] Add regression coverage for palette orchestration that should survive extraction.
- [x] Extract query execution, mode transitions, result reset, and item/hit selection into `useCommandPaletteController`.
- [x] Keep `CommandPalette.tsx` as a thin composition shell for search, overlay, keyboard, and dialog.
- [x] Lower `CommandPalette.tsx` ratchet after line-count evidence.

## Block 2: DataPanel Import/Export Helpers

- [x] Move import payload parsing/version validation into a pure model helper.
- [x] Move import result message formatting into a pure helper with tests.
- [x] Centralize existing-ID set construction to reduce render-level noise.
- [x] Keep the UI flow identical: upload shows preview, confirm imports, cancel clears preview.
- [x] Lower `DataPanel.tsx` ratchet after extraction.

## Block 3: Backend/LLM or PDF Surface Headroom

- [x] Inspect current tests around `llm/dispatch` and PDF Studio surfaces.
- [x] Pick the lowest-risk hotspot with existing seams.
- [x] Extract one pure helper or controller with focused tests.
- [x] Avoid touching provider semantics, cache semantics, or PDF rendering behavior unless tests pin it first.

## Block 4: Ratchets and Validation

- [x] Update `scripts/structure-ratchets.mjs` only for files proven thinner.
- [x] Run focused tests for changed areas.
- [x] Run `npm run check:structure-ratchets`.
- [x] Run `npm run typecheck`.
- [x] Run broader gates before PR closeout.

## Commit Shape

1. `docs(structure): plan hotspot burn-down pack`
2. `refactor(command-palette): extract controller orchestration`
3. `refactor(settings): extract data panel helpers`
4. `refactor(<hotspot>): extract focused model/helper`
5. `test(structure): tighten hotspot ratchets`
