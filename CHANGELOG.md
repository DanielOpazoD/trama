# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **N1**: ESLint flat config + Prettier + Husky pre-commit hook + lint-staged. CI corre `lint` y `format:check` antes de tests.
- **N2**: CSP + HSTS + X-Frame-Options + Permissions-Policy en `netlify.toml`. Dependabot semanal (npm + github-actions). Comment de threat model en el único `dangerouslySetInnerHTML` (QR code).
- **N3**: `LICENSE` (MIT), `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`, PR template, issue templates (bug + feature), `CODEOWNERS`.
- **N4**: Schema Zod en `_lib/env.ts` que valida todas las env vars al boot. Tipos inferidos exportados.

### Changed

- `package.json`: nuevos scripts `lint`, `lint:fix`, `format`, `format:check`, `prepare`.
- `.github/workflows/test.yml`: lint + format check antes de typecheck.

### Fixed

- 3 high-severity CVEs en deps transitivas (`js-cookie`, `tmp`, `@clerk/shared`).
- `LogsPanel.tsx`: `useMemo` violaba rules-of-hooks — movido antes de los early returns.
- `e2e/fixtures.ts`: zero-width space invisible en comment removido.

## [0.11.0] — 2026-05-27

### Added

- **Tier J+K**: tests RTL para extracciones recientes (`GraphSvgCanvas`, `GraphExploreHint`, `GraphSuggestStatusBanner`, `useGraphKeyboardNav`, `useInitialView`); tests de \_lib críticos (`observability`, `cost-cap`, `handler-wrap`); tests de hooks de state grandes (`useEntities`, `useQuotes`, `useExtract`, `useAISettings`). 590 → 652 tests.
- **Tier J1**: `POST/DELETE` en `entity-types` y `relationship-types` requieren auth.

## [0.10.0] — 2026-05-27

### Added

- **Tier F**: privacidad multi-user. `extraction-log` y `error-log` GETs requieren auth y filtran por `user_id`. Migración backfill `20260528` para rows huérfanos. `ai_task_providers` per-user (cache + endpoint). `cost-cap` migrado a `ApiErrors.rateLimited` con shape canónico.
- **Tier H**: `useInitialView()` hook extraído de App.tsx (-38 LOC). `requireSpotifyConnection()` helper centraliza 4 endpoints.

### Fixed

- Typo `'suggest'` → `'suggest-relationships'` en `spotify-suggest-artists.mts` (no era un AITask válido).

## [0.9.0] — 2026-05-27

### Added

- **Tier C**: multi-user infra para Spotify endpoints (status, sync, timing, suggest-artists, library-snapshot, import-playlist filtran y persisten por `user_id`). Per-user LLM budget cap (migración `users.monthly_budget_cents`).
- **Tier D**: ErrorBoundary granular per-view. Cada vista en `ViewRouter` se envuelve en su propio boundary con fallback compacto inline; un crash en una vista no tira abajo Sidebar/TopBar.
- **Tier E**: GraphView split. 673 → 505 LOC. Extraído a `GraphSvgCanvas` (227 LOC), `GraphExploreHint` (49), `GraphSuggestStatusBanner` (53), `useGraphKeyboardNav` (64).

## Earlier

Para historia anterior ver [`docs/changelog/sprints-historicos.md`](./docs/changelog/sprints-historicos.md).
