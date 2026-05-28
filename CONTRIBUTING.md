# Contributing to Trama

Gracias por interesarte en contribuir. Trama es un proyecto personal pero sigue convenciones que cualquier colaborador externo debe respetar.

## Antes de empezar

1. Leé [`FILOSOFIA.md`](./FILOSOFIA.md) — entendé qué es Trama y qué NO es.
2. Leé [`CLAUDE.md`](./CLAUDE.md) — reglas que no se pueden romper (migraciones inmutables, soft delete, snake_case ↔ camelCase, etc.).
3. Mirá [`ARCHITECTURE.md`](./ARCHITECTURE.md) y `docs/conventions/*.md` para entender los patrones específicos del dominio.

## Setup local

```bash
git clone https://github.com/DanielOpazoD/trama.git
cd trama
npm install
npm run dev          # http://localhost:5173
```

Para el backend con DB real (opcional, la app funciona con `localStorage` fallback):

```bash
cp .env.example .env.local
# Editá .env.local con tus credenciales de Netlify/Neon/LLM
npm run db:up        # docker-compose con Postgres + migrations
```

Ver [`docs/deploy.md`](./docs/deploy.md) para detalles de env vars.

## Flujo de PR

1. **Rama nueva** con prefijo descriptivo: `chore/`, `feat/`, `fix/`, `docs/`, `refactor/`.
2. **Commits pequeños y enfocados** — un commit por cambio lógico.
3. **Antes de pushear, corré localmente**:

   ```bash
   npm run lint
   npm run format:check
   npm run typecheck
   npm test
   npm run build
   ```

   El pre-commit hook de Husky corre `lint-staged` (lint + format) automáticamente. CI corre todo lo demás (typecheck, test, build, bundle-size, e2e).

4. **Pull request** contra `main` con:
   - Título conciso (`< 70 chars`).
   - Descripción usando el template (`PR_TEMPLATE.md` se auto-completa).
   - Test plan claro.

5. **Espera CI verde** antes de pedir review.

## Convenciones

### Naming

- **Branches**: `chore/<slug>`, `feat/<slug>`, `fix/<slug>`
- **Commits**: imperativo en español o inglés (consistente con el repo): `chore: agrega N1 tooling`, no `agregado N1`.
- **Componentes React**: PascalCase, archivo igual al export principal (`GraphView.tsx` exporta `GraphView`).
- **Hooks**: camelCase con prefijo `use` (`useGraphLayout`, `useInitialView`).

### Estilo

- **Prettier** define el formato. No discutas tabs vs spaces — Prettier decide.
- **ESLint** define reglas semánticas. Si una regla parece molesta, abrí un issue antes de desactivarla.
- **TypeScript estricto** con `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`. No bypassees con `any`; usá `unknown` o tipa correctamente.

### Patterns que NO romper

- **`ApiErrors.*` en lugar de `new Response('texto', { status })`** — el cliente parsea shape canónico.
- **`getSql()`** en lugar de `neon()` directo.
- **`logEvent` / `logErrorEvent`** en lugar de `console.log` / `console.error` en código de producción.
- **Soft delete** (`UPDATE SET deleted_at = NOW()`), nunca `DELETE FROM`.
- **Migrations son inmutables** — si querés cambiar el schema, creá una migración nueva.

Ver [`CLAUDE.md`](./CLAUDE.md) → "Cosas que NO hagas".

## Tests

Cualquier feature nueva necesita test. Cualquier bugfix necesita un test que reproduzca el bug (Test-Driven Bugfix).

- **Unit + integration**: `src/**/*.test.ts(x)` + `netlify/functions/_lib/*.test.ts` con Vitest.
- **E2E**: `e2e/*.spec.ts` con Playwright. Solo para flujos de UI críticos (NO unit test disfrazado).
- **A11y**: `e2e/a11y.spec.ts` corre axe-core contra cada vista. Si tu cambio agrega UI nueva, agregalo a la lista.

## Reportar bugs y proponer features

Usá los templates en `.github/ISSUE_TEMPLATE/`. Antes de abrir un bug, fijate si ya existe uno parecido.

## Reportar vulnerabilidades de seguridad

**NO abras un issue público.** Ver [`SECURITY.md`](./SECURITY.md) para el proceso.

## Code of Conduct

Este proyecto adopta el [Contributor Covenant](./CODE_OF_CONDUCT.md). Comportate como un adulto razonable.
