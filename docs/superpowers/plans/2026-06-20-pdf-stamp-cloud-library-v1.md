# PDF Stamp Cloud Library v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist PDF Studio signatures and stamps in Trama's private per-user database while keeping the existing IndexedDB library as cache/fallback.

**Architecture:** Add a `pdf_stamp_assets` table scoped by `user_id`, a thin Netlify wrapper plus tested `_lib` endpoint, a typed client API, and a cloud-first stamp-assets hook. The UI keeps the existing menu and annotation flow; only the persistence boundary changes.

**Tech Stack:** Netlify Functions, Netlify Database/Postgres, Clerk auth via `getAuthedUser()`, Zod request parsing, React hooks, IndexedDB fallback, Vitest.

---

## Task 1: Database Contract

**Files:**

- Create: `netlify/database/migrations/20260620010000_pdf_stamp_assets/migration.sql`
- Modify: `scripts/auth-rls-contracts.mjs` if the guardrail needs an explicit table contract.

- [ ] Create `pdf_stamp_assets` with `id`, `user_id`, `kind`, `name`, `src`, `mime_type`, `width`, `height`, `byte_size`, `created_at`, `updated_at`, `last_used_at`, `deleted_at`.
- [ ] Add FK to `users(id)`, checks for kind/mime/dimensions/byte size, indexes by `(user_id, deleted_at, updated_at)` and `(user_id, last_used_at)`.
- [ ] Enable RLS and policies using `app.current_user_id`, matching existing private-table patterns.
- [ ] Verify migration text is immutable and uses soft-delete semantics.

## Task 2: Endpoint RED/GREEN

**Files:**

- Create: `netlify/functions/pdf-stamp-assets.mts`
- Create: `netlify/functions/_lib/pdf-stamp-assets-endpoint.ts`
- Create: `netlify/functions/_lib/pdf-stamp-assets-endpoint.test.ts`

- [ ] Write failing tests for GET list filtering by `user_id` and `deleted_at IS NULL`.
- [ ] Write failing tests for POST create with `ensureUserRow()`, validation, byte-size limit, and camel/snake response shape.
- [ ] Write failing tests for PATCH rename/touch using `WHERE id = ... AND user_id = ... AND deleted_at IS NULL RETURNING`.
- [ ] Write failing tests for DELETE soft-delete with `RETURNING`, including owner mismatch returning canonical 404.
- [ ] Implement the endpoint using `withObservability`, `getAuthedUser`, `getSql`, `ApiErrors`, and Zod parsing.

## Task 3: Client API and Hook

**Files:**

- Create: `src/api/pdfStampAssets.ts`
- Modify: `src/components/notas/pdfStudio/stamps/usePdfStudioStampAssets.ts`
- Modify tests under `src/components/notas/pdfStudio/stamps/`.

- [ ] Write failing client transform tests for snake_case rows to `PdfStudioStampAsset`.
- [ ] Add API methods `list`, `create`, `rename`, `remove`, `touch`.
- [ ] Update the hook to load cloud assets first, mirror them into IndexedDB cache, and fall back to local cache when cloud fails.
- [ ] Preserve optimistic create/rename/delete/touch behavior and userKey clearing.
- [ ] Add tests proving user A/B isolation at the hook/API boundary through userKey-specific cache and server calls.

## Task 4: UX and Migration From Local Cache

**Files:**

- Modify: `src/components/notas/pdfStudio/stamps/StampAssetMenuHost.tsx`
- Modify: `src/components/notas/pdfStudio/stamps/StampAssetMenu.tsx` only if a small status indicator is needed.

- [ ] Import existing local IndexedDB assets when cloud list is empty and the user creates/opens the cloud library.
- [ ] Avoid duplicate import by stable IDs.
- [ ] Keep UI compact: no new modal, no account-sharing controls, no legal-signature claims.
- [ ] Surface only a minimal non-blocking offline/cache state if needed.

## Task 5: Docs and Guardrails

**Files:**

- Modify: `docs/pdf-studio.md`
- Modify: `docs/conventions/dominios.md` if useful.
- Modify: structure/API guardrails only when required by the new endpoint.

- [ ] Document that signatures/stamps are now private DB-backed assets, with IndexedDB as local cache/fallback.
- [ ] Document that this remains a visual signature/stamp, not a legal digital signature.
- [ ] Ensure no client calls Netlify Blobs or stores shared assets.

## Task 6: Validation and PR

- [ ] Run focused endpoint and hook tests.
- [ ] Run `npm run format:check`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run check:structure-ratchets`.
- [ ] Run `npm test`.
- [ ] Run `npm run build && node scripts/check-bundle-size.mjs`.
- [ ] Commit logical changes, push `codex/pdf-stamp-cloud-library-v1`, open PR, and verify remote checks.
