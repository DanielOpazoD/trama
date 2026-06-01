# Multiuser Quality Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llevar Trama desde una base multiusuario funcional a una base profesionalmente endurecida: privacidad de media, contratos consistentes, E2E criticos, observabilidad util, docs alineadas y deuda de estado cliente reducida, sin crear funcionalidades nuevas.

**Architecture:** Mantener la arquitectura actual: React + TanStack Query en cliente, Netlify Functions con `withObservability`, `getSql()`, `ApiErrors`, RLS via `_lib/user-rls.ts`, media a traves de endpoints autenticados y blobs solo desde servidor. La rama sera una sola rama grande, pero cada tarea debe terminar verde y commitearse por separado.

**Tech Stack:** React 18, TypeScript, Vite, TanStack Query, Clerk, Netlify Functions, Netlify Blobs, Neon/Postgres RLS, Vitest, Playwright, GitHub Actions.

---

## Branch And Commit Policy

Target branch:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c codex/multiuser-quality-hardening
```

Commit after each meaningful task:

- `fix(security): prevent shared caching of private media`
- `test(e2e): add critical multiuser isolation smoke`
- `fix(api): align quotes list contract`
- `fix(state): constrain local fallback in authenticated mode`
- `chore(export): clarify backup scope contracts`
- `chore(obs): harden privacy and request-id guardrails`
- `docs: align multiuser hardening runbooks`
- `chore: refresh quality gates`

Do not add new user-facing features. Every change must reduce risk, improve contracts, or make existing behavior more reliable.

## File Map

- `netlify/functions/momentos-file.mts`: authenticated private media response headers.
- `netlify/functions/_lib/momentos-file-endpoint.test.ts`: media ownership and cache header regression tests.
- `e2e/multi-user-isolation.spec.ts`: browser/API smoke for two-user privacy when credentials are configured.
- `playwright.config.ts`: optional env plumbing only if existing config needs it.
- `netlify/functions/quotes.mts`: quote list contract consistency.
- `netlify/functions/_lib/quotes-endpoint.test.ts`: quote API contract tests.
- `src/state/useEntities.ts`, `src/state/useRelationships.ts`, `src/state/useQuotes.ts`: local fallback behavior in authenticated/multiuser mode.
- `src/lib/demo.ts`: source of truth for demo/local-only mode.
- `src/state/*.test.tsx`: state fallback regression tests.
- `netlify/functions/export.mts`, `netlify/functions/import.mts`, `netlify/functions/_lib/export-scope.ts`: backup scope clarity.
- `src/components/settings/DataPanel.tsx`: wording only, if current UI overpromises backup completeness.
- `netlify/functions/error-log.mts`, `netlify/functions/web-vitals.mts`, `netlify/functions/_lib/handler-wrap.ts`: observability privacy/request-id guardrails.
- `docs/arquitectura.md`, `docs/migracion-multi-user.md`, `docs/conventions/roadmap.md`, `docs/datos.md`, `.github/workflows/test.yml`: docs drift cleanup.

---

### Task 1: Private Media Cache Hardening

**Risk addressed:** `/api/momentos-file/:key` authorizes before reading a blob, but currently returns private media with public immutable cache semantics. That is too risky for multiusuario.

**Files:**

- Modify: `netlify/functions/momentos-file.mts`
- Modify/Test: `netlify/functions/_lib/momentos-file-endpoint.test.ts`

- [ ] **Step 1: Write failing cache-header tests**

Add assertions to the existing successful media test:

```ts
expect(res.status).toBe(200)
expect(res.headers.get('Cache-Control')).toBe('private, no-store')
expect(res.headers.get('Vary')).toContain('Authorization')
```

Also assert the unauthorized path still does not reveal whether a blob exists:

```ts
expect(res.status).toBe(404)
expect(await res.json()).toMatchObject({
  error: { code: 'NOT_FOUND' },
})
```

- [ ] **Step 2: Run focused test and confirm failure**

```bash
npx vitest run netlify/functions/_lib/momentos-file-endpoint.test.ts
```

Expected: cache-header assertion fails because the endpoint still sends `public, max-age=31536000, immutable`.

- [ ] **Step 3: Change response headers only**

In `netlify/functions/momentos-file.mts`, keep auth and blob lookup unchanged. Replace only media response cache headers:

```ts
return new Response(body, {
  headers: {
    'Content-Type': contentType,
    'Cache-Control': 'private, no-store',
    Vary: 'Authorization',
  },
})
```

If the current code also sets `Content-Length` or similar metadata, preserve it.

- [ ] **Step 4: Verify**

```bash
npx vitest run netlify/functions/_lib/momentos-file-endpoint.test.ts
npm run typecheck
```

Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/momentos-file.mts netlify/functions/_lib/momentos-file-endpoint.test.ts
git commit -m "fix(security): prevent shared caching of private media"
```

---

### Task 2: Critical Multiuser Isolation E2E

**Risk addressed:** unit/boundary tests cover isolation, but the product needs an executable smoke that proves two authenticated users cannot cross-read core data through deployed-style APIs.

**Files:**

- Create: `e2e/multi-user-isolation.spec.ts`
- Modify only if needed: `playwright.config.ts`
- Optional docs update: `docs/deploy.md`

- [ ] **Step 1: Add env-gated Playwright test**

Create `e2e/multi-user-isolation.spec.ts` with tests skipped unless all required variables exist:

```ts
import { test, expect, request } from '@playwright/test'

const required = ['E2E_BASE_URL', 'E2E_USER_A_TOKEN', 'E2E_USER_B_TOKEN'] as const

function hasEnv(): boolean {
  return required.every((key) => Boolean(process.env[key]))
}

test.describe('multi-user isolation smoke', () => {
  test.skip(!hasEnv(), 'requires E2E_BASE_URL, E2E_USER_A_TOKEN and E2E_USER_B_TOKEN')

  test('user B cannot read user A entity through direct API ids', async () => {
    const baseURL = process.env.E2E_BASE_URL!
    const userA = await request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${process.env.E2E_USER_A_TOKEN!}` },
    })
    const userB = await request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${process.env.E2E_USER_B_TOKEN!}` },
    })

    const marker = `isolation-${Date.now()}`
    const create = await userA.post('/api/entities', {
      data: {
        name: marker,
        type: 'concepto',
        description: 'private smoke fixture',
        origin: { kind: 'manual' },
      },
    })
    expect(create.status()).toBe(201)
    const entity = await create.json()

    const directRead = await userB.get(`/api/entities/${entity.id}`)
    expect([404, 405]).toContain(directRead.status())

    const search = await userB.get(`/api/search?q=${encodeURIComponent(marker)}`)
    expect(search.status()).toBe(200)
    const body = await search.json()
    expect(JSON.stringify(body)).not.toContain(marker)
  })
})
```

If `/api/entities/:id` does not support GET-by-id, the `[404, 405]` expectation documents the current contract while still proving no data body leaks.

- [ ] **Step 2: Run skipped locally**

```bash
npx playwright test e2e/multi-user-isolation.spec.ts
```

Expected locally without env: skipped, not failed.

- [ ] **Step 3: Document how to run real smoke**

In `docs/deploy.md`, add a short command under pre-release verification:

```bash
E2E_BASE_URL=https://tramadaod.netlify.app \
E2E_USER_A_TOKEN=... \
E2E_USER_B_TOKEN=... \
npx playwright test e2e/multi-user-isolation.spec.ts
```

Note: tokens must be short-lived Clerk test tokens for two non-admin test users.

- [ ] **Step 4: Verify**

```bash
npx playwright test e2e/multi-user-isolation.spec.ts
npm test -- --run netlify/functions/_lib/isolation-guardrail.test.ts netlify/functions/_lib/user-rls.test.ts
```

Expected: Playwright skips if env absent; focused isolation tests pass.

- [ ] **Step 5: Commit**

```bash
git add e2e/multi-user-isolation.spec.ts docs/deploy.md
git commit -m "test(e2e): add critical multiuser isolation smoke"
```

---

### Task 3: Quotes API Contract Consistency

**Risk addressed:** the paginated quotes path returns fields that the wholesale path omits. That kind of partial contract causes UI bugs and weakens confidence in transforms.

**Files:**

- Modify: `netlify/functions/quotes.mts`
- Modify/Test: `netlify/functions/_lib/quotes-endpoint.test.ts`
- Modify/Test if needed: `src/api/quotes.ts` or `src/api/transform.test.ts`

- [ ] **Step 1: Write failing API contract test**

In the quotes endpoint tests, add a case where list-all returns `link` and `pinned_at`:

```ts
expect(sql.mock.calls.some((call) => String(call[0]).includes('pinned_at'))).toBe(true)
expect(sql.mock.calls.some((call) => String(call[0]).includes('link'))).toBe(true)
```

If the test harness inspects response rows instead of SQL text, assert camelCase output:

```ts
expect(body[0]).toMatchObject({
  link: 'https://example.com/source',
  pinnedAt: '2026-01-01T00:00:00.000Z',
})
```

- [ ] **Step 2: Run focused test and confirm failure**

```bash
npx vitest run netlify/functions/_lib/quotes-endpoint.test.ts
```

Expected: wholesale list path does not include one or both fields.

- [ ] **Step 3: Align SELECT fields**

In `netlify/functions/quotes.mts`, update the wholesale `SELECT` so it includes the same public contract fields as the paginated path:

```sql
SELECT id, entity_id, text, source, context, user_reflection, ai_reflection,
       ai_reflection_provider, ai_reflection_model, ai_reflection_at,
       linked_quote_ids, pinned_at, resonance, link, origin, created_at, updated_at
FROM quotes
WHERE deleted_at IS NULL AND user_id = ${userId}
ORDER BY created_at DESC
LIMIT 5000
```

Do not change write behavior.

- [ ] **Step 4: Verify**

```bash
npx vitest run netlify/functions/_lib/quotes-endpoint.test.ts src/api/transform.test.ts src/state/useQuotes.test.tsx
npm run typecheck
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/quotes.mts netlify/functions/_lib/quotes-endpoint.test.ts src/api/transform.test.ts src/state/useQuotes.test.tsx
git commit -m "fix(api): align quotes list contract"
```

---

### Task 4: Authenticated Mode Local Fallback Cleanup

**Risk addressed:** localStorage fallback made sense in single-user/offline mode. In authenticated multiuser mode, silent fallback can show stale/private local data that does not represent the logged-in user.

**Files:**

- Modify: `src/state/useEntities.ts`
- Modify: `src/state/useRelationships.ts`
- Modify: `src/state/useQuotes.ts`
- Modify/Test: `src/state/useEntities.test.tsx`
- Modify/Test: `src/state/useRelationships.test.tsx`
- Modify/Test: `src/state/useQuotes.test.tsx`
- Read: `src/lib/demo.ts`

- [ ] **Step 1: Add tests for fallback policy**

Add tests proving:

```ts
// API failure + navigator.onLine === true => throw, do not return localStorage
// API failure + navigator.onLine === false + demo mode disabled => throw or empty safe state
// demo mode enabled => localStorage fallback remains available
```

Use existing state hook test patterns and mock `isDemoMode()` if needed.

- [ ] **Step 2: Run focused tests and confirm failure**

```bash
npx vitest run src/state/useEntities.test.tsx src/state/useRelationships.test.tsx src/state/useQuotes.test.tsx
```

Expected: current hooks return storage data too broadly.

- [ ] **Step 3: Implement a small shared policy if existing style allows**

Prefer a tiny helper near the state layer, for example `src/state/localFallback.ts`:

```ts
import { isDemoMode } from '../lib/demo'

export function canUseLocalFallback(): boolean {
  if (isDemoMode()) return true
  if (typeof navigator !== 'undefined' && !navigator.onLine) return false
  return false
}
```

Then in each hook, replace broad `storage.load*()` fallback with:

```ts
if (canUseLocalFallback()) return storage.loadEntities()
throw err
```

For relationship and quote hooks, use their matching storage loaders.

- [ ] **Step 4: Verify no UX regression in demo mode**

```bash
npx vitest run src/lib/demo.test.ts src/state/useEntities.test.tsx src/state/useRelationships.test.tsx src/state/useQuotes.test.tsx
npm run typecheck
```

Expected: pass; demo mode still works.

- [ ] **Step 5: Commit**

```bash
git add src/state/useEntities.ts src/state/useRelationships.ts src/state/useQuotes.ts src/state/localFallback.ts src/state/*.test.tsx
git commit -m "fix(state): constrain local fallback in authenticated mode"
```

---

### Task 5: Export And Import Scope Clarity

**Risk addressed:** backup/export is intentionally partial, but the product must never imply a full privacy-grade export including blob bytes, chat, OAuth tokens, X/Spotify raw data, logs, or embeddings.

**Files:**

- Modify: `netlify/functions/_lib/export-scope.ts`
- Modify/Test: `netlify/functions/_lib/export-endpoint.test.ts`
- Modify/Test: `netlify/functions/_lib/import-endpoint.test.ts`
- Modify: `src/components/settings/DataPanel.tsx`
- Modify/Test: `src/components/settings/DataPanel.test.tsx`
- Modify: `docs/datos.md`

- [ ] **Step 1: Write tests for exact scope warnings**

Assert export includes:

```ts
expect(body.scope).toMatchObject({
  kind: 'structured-core',
  completeness: 'partial',
})
expect(body.scope.excludes).toContain('netlify_blobs_binary')
expect(body.scope.excludes).toContain('chat_messages')
expect(body.scope.warnings.join(' ')).toContain('No incluye bytes binarios')
```

Assert import echoes a warning that it does not restore blobs/tokens/logs.

- [ ] **Step 2: Run focused tests**

```bash
npx vitest run netlify/functions/_lib/export-endpoint.test.ts netlify/functions/_lib/import-endpoint.test.ts src/components/settings/DataPanel.test.tsx
```

- [ ] **Step 3: Tighten labels without adding capability**

If the UI says "backup completo", change wording to "backup estructurado" or "export parcial". Do not add blob download.

- [ ] **Step 4: Verify**

```bash
npx vitest run netlify/functions/_lib/export-endpoint.test.ts netlify/functions/_lib/import-endpoint.test.ts src/components/settings/DataPanel.test.tsx
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_lib/export-scope.ts netlify/functions/_lib/export-endpoint.test.ts netlify/functions/_lib/import-endpoint.test.ts src/components/settings/DataPanel.tsx src/components/settings/DataPanel.test.tsx docs/datos.md
git commit -m "chore(export): clarify backup scope contracts"
```

---

### Task 6: Observability Privacy And Request-Id Guardrails

**Risk addressed:** observability is useful, but logs can become a privacy leak if they retain sensitive paths, query params, stacks, or unauthenticated samples under legacy users.

**Files:**

- Modify: `netlify/functions/error-log.mts`
- Modify: `netlify/functions/web-vitals.mts`
- Modify: `netlify/functions/_lib/handler-wrap.ts`
- Modify/Test: `netlify/functions/_lib/error-log-boundary.test.ts`
- Modify/Test: `netlify/functions/_lib/web-vitals-endpoint.test.ts`
- Modify/Test: `netlify/functions/_lib/handler-wrap.test.ts`
- Modify/Test: `src/lib/clientErrorTracking.test.ts`
- Modify/Test: `src/lib/webVitals.test.ts`

- [ ] **Step 1: Add tests for sanitized paths and request ids**

Add tests proving:

```ts
expect(logged.httpPath).not.toContain('entity=')
expect(response.headers.get('x-request-id')).toMatch(/[0-9a-f-]{36}/)
expect(unauthenticatedPost.status).toBe(204)
expect(dbInsert).not.toHaveBeenCalled()
```

- [ ] **Step 2: Run focused tests and confirm gaps**

```bash
npx vitest run netlify/functions/_lib/error-log-boundary.test.ts netlify/functions/_lib/web-vitals-endpoint.test.ts netlify/functions/_lib/handler-wrap.test.ts src/lib/clientErrorTracking.test.ts src/lib/webVitals.test.ts
```

- [ ] **Step 3: Normalize paths server-side too**

If only the client normalizes paths, add a server-side sanitizer near the endpoint that removes query strings and replaces UUIDs with `:id`.

```ts
function sanitizePath(path: string | null | undefined): string | null {
  if (!path) return null
  return path
    .split('?')[0]!
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .slice(0, 500)
}
```

Use it before persisting client error paths and web-vitals paths.

- [ ] **Step 4: Verify**

```bash
npx vitest run netlify/functions/_lib/error-log-boundary.test.ts netlify/functions/_lib/web-vitals-endpoint.test.ts netlify/functions/_lib/handler-wrap.test.ts src/lib/clientErrorTracking.test.ts src/lib/webVitals.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/error-log.mts netlify/functions/web-vitals.mts netlify/functions/_lib/handler-wrap.ts netlify/functions/_lib/*test.ts src/lib/clientErrorTracking.test.ts src/lib/webVitals.test.ts
git commit -m "chore(obs): harden privacy and request-id guardrails"
```

---

### Task 7: Docs Drift And Operational Truth

**Risk addressed:** the code is ahead of some docs/comments. For a professional app, docs must describe current multiuser/RLS reality and not stale roadmap assumptions.

**Files:**

- Modify: `docs/arquitectura.md`
- Modify: `docs/migracion-multi-user.md`
- Modify: `docs/conventions/roadmap.md`
- Modify: `docs/deploy.md`
- Modify: `docs/datos.md`
- Modify: `.github/workflows/test.yml`
- Modify if still stale: `netlify/functions/_lib/llm/cache.ts`

- [ ] **Step 1: Update multiuser status**

In docs, distinguish clearly:

```md
Estado actual: aislamiento multiusuario con Clerk + `user_id` + RLS forzado.
Limite consciente: no es cero-conocimiento; quien controla Neon/Netlify/Blobs/env/logs puede acceder a datos.
```

- [ ] **Step 2: Fix stale CI migration count**

Replace hardcoded "30 migrations" comments with neutral text:

```yaml
# Migration guard: apply all migrations once and reapply to catch hash/order/schema drift.
```

- [ ] **Step 3: Fix stale LLM cache comment**

If `_lib/llm/cache.ts` still claims DB cache is future work, replace with:

```ts
// In-memory helpers kept for per-process reuse. Persistent cache lives in `_lib/llm/db-cache.ts`.
```

- [ ] **Step 4: Run docs drift and type gates**

```bash
npm run check:docs-drift
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add docs/arquitectura.md docs/migracion-multi-user.md docs/conventions/roadmap.md docs/deploy.md docs/datos.md .github/workflows/test.yml netlify/functions/_lib/llm/cache.ts
git commit -m "docs: align multiuser hardening runbooks"
```

---

### Task 8: Final Quality Gates And PR Readiness

**Risk addressed:** a mega rama can look good locally but fail deploy, migrations, or E2E.

**Files:**

- Modify only generated reports if existing scripts intentionally write them.
- No feature code changes in this task.

- [ ] **Step 1: Run full local gates**

```bash
npm run check:legacy-fallback
npm run check:hard-delete-allowlist
npm run check:docs-drift
npm run lint
npm run typecheck
npm test -- --run
npm run build
npx playwright test
```

Expected: all pass. If Playwright needs browsers/server, use the repo's existing Playwright workflow rather than changing app code.

- [ ] **Step 2: Inspect git diff**

```bash
git status --short
git diff --stat origin/main...HEAD
git log --oneline origin/main..HEAD
```

Expected: commits map to the tasks above; no unrelated generated files.

- [ ] **Step 3: Push branch**

```bash
git push -u origin codex/multiuser-quality-hardening
```

- [ ] **Step 4: Open draft PR**

PR title:

```text
Hardening multiusuario: privacidad, contratos y observabilidad
```

PR body must include:

```md
## Resumen

- Endurece cache de media privada.
- Agrega smoke E2E multiusuario env-gated.
- Alinea contrato de quotes.
- Reduce fallback localStorage en modo autenticado.
- Refuerza privacidad de observabilidad.
- Actualiza docs operacionales.

## Verificacion

- npm run check:legacy-fallback
- npm run check:hard-delete-allowlist
- npm run check:docs-drift
- npm run lint
- npm run typecheck
- npm test -- --run
- npm run build
- npx playwright test

## Limites

- No implementa cifrado extremo a extremo.
- No exporta bytes binarios de Netlify Blobs.
- El smoke multiusuario real requiere tokens Clerk de dos usuarios de prueba.
```

- [ ] **Step 5: Wait for CI**

```bash
gh pr checks --watch
```

Expected: all required checks pass before marking ready for review or merge.

---

## Self-Review

Spec coverage:

- Privacidad multiusuario: Tasks 1, 2, 4, 6.
- Contratos/API: Task 3.
- E2E criticos: Task 2.
- Observabilidad: Task 6.
- Estructura/calidad sin funcionalidades nuevas: Tasks 4, 5, 7, 8.
- Commits significativos: Branch and Commit Policy plus every task ends with commit.

Known non-goals:

- No E2E zero-knowledge, because this plan explicitly preserves the current non-zero-knowledge model.
- No new product features.
- No migration mutation: if a DB schema change appears during execution, create a new migration only.

Completion definition:

- The branch exists as `codex/multiuser-quality-hardening`.
- Every task has its own commit.
- All local gates in Task 8 pass.
- CI passes on the PR.
- The PR body names remaining limits honestly.
