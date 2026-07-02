# Settings Chunk Panel Boundaries Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the Settings chunk pressure and harden panel boundaries without changing the visible UX.

**Architecture:** Keep `Settings.tsx` as the modal shell and `SettingsPanelContent.tsx` as a thin router. Less frequent panels move behind local `React.lazy` hosts with a minimal fallback, while high-value pure derivations move into small model files with focused tests.

**Tech Stack:** React, Vite chunks, Vitest, existing bundle budget scripts.

---

## Baseline Evidence

- `npm run build`: `dist/assets/Settings-DTHwUfNx.js` measured 66.84 kB raw / 18.35 kB gzip.
- `npm run bundle:check`: passed because the checker reports rounded 18 KB against the 18 KB budget, but the Vite gzip output shows the chunk is already over the explicit ceiling.
- Current pressure comes from `SettingsPanelContent.tsx` statically importing every panel even though Settings opens on `health` by default.

## Task 1: Lazy Panel Boundary Tests

**Files:**

- Modify: `src/components/Settings.test.tsx`
- Modify: `src/components/settings/settingsModel.test.ts`

- [ ] Add a test that opens Settings, navigates to a lazy section, and observes the existing panel contract after the lazy module resolves.
- [ ] Add a pure model test for the sections that should stay eager versus lazy so future panel additions cannot silently bloat the Settings chunk.
- [ ] Run: `npm test -- src/components/Settings.test.tsx src/components/settings/settingsModel.test.ts`
- [ ] Expected before implementation: fail because the model does not expose lazy panel classification yet.

## Task 2: Lazy Hosts For Infrequent Panels

**Files:**

- Modify: `src/components/settings/SettingsPanelContent.tsx`
- Modify: `src/components/settings/settingsModel.ts`

- [ ] Keep `health` eager as the first-open diagnostic panel.
- [ ] Load these less frequent panels through local lazy hosts: `logs`, `personalization`, `privacy`, `spotify`, `extension`, `whatsapp`, `x`, `ai`, `search`, `data`.
- [ ] Keep `appearance` eager because it is small and receives theme callbacks directly.
- [ ] Use one minimal fallback that preserves spacing and does not introduce a new visual state beyond loading text.
- [ ] Run: `npm test -- src/components/Settings.test.tsx src/components/settings/settingsModel.test.ts`
- [ ] Expected after implementation: pass.

## Task 3: Pure Model Extraction

**Files:**

- Create: `src/components/settings/extensionPanelModel.ts`
- Create: `src/components/settings/extensionPanelModel.test.ts`
- Create: `src/components/settings/searchPanelModel.ts`
- Create: `src/components/settings/searchPanelModel.test.ts`
- Modify: `src/components/settings/ExtensionPanel.tsx`
- Modify: `src/components/settings/SearchPanel.tsx`

- [ ] Extract extension token date formatting into `formatExtensionTokenDate`.
- [ ] Extract reindex progress derivation into `buildReindexProgress`.
- [ ] Cover invalid dates, null dates, empty pending state, active progress, and completed progress.
- [ ] Run: `npm test -- src/components/settings/extensionPanelModel.test.ts src/components/settings/searchPanelModel.test.ts src/components/settings/ExtensionPanel.test.tsx src/components/settings/SearchPanel.test.tsx`
- [ ] Expected: model tests fail before implementation, then pass after the extraction.

## Task 4: Bundle Ratchet And Validation

**Files:**

- Modify: `scripts/check-bundle-size.mjs`

- [ ] Run `npm run build` and inspect the new `Settings-*` gzip size.
- [ ] If the chunk drops with measurable margin, lower the `Settings` budget instead of keeping stale headroom.
- [ ] Run `npm run bundle:check`, `npm run typecheck`, `npm run check:architecture`, and `npm run check:structure-ratchets`.
- [ ] Run focused Settings tests and any changed model tests.
- [ ] Commit in logical blocks: inventory/plan, lazy panels, pure models/tests, bundle ratchet.
