# Scripts operacionales

Esta carpeta contiene checks, smokes, runners y herramientas de mantenimiento.
El mapa ejecutable vive en `scripts/script-registry.mjs` y se valida con:

```bash
npm run check:script-registry
```

Si agregas un script nuevo bajo `scripts/`, tambien agrega su entrada al
registry. Si agregas un comando nuevo en `package.json` que llama a
`scripts/*`, enlazalo desde `packageScripts`. Si lo corres en GitHub Actions,
agregalo a `QUALITY_GATES`.

## Rutas de uso

| Momento                 | Comandos habituales                                                                                                                                | Notas                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Antes de commit         | `npm run format:check`, test focalizado, `npm run check:script-registry`                                                                           | Feedback rapido antes de push.                                  |
| Antes de abrir PR       | `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`                                                                                   | Base amplia si el cambio toca varias superficies.               |
| Cambios API/backend     | `check:api-request-contracts`, `check:runtime-api-routes`, `check:backend-domain-services`, `check:client-api-contracts`                           | Mantiene parsers, wrappers Netlify y servicios testeables.      |
| Cambios auth/multiuser  | `check:legacy-fallback`, `check:auth-rls-contracts`, `check:legacy-identity-contracts`, `check:operational-observability`                          | Complementar con smoke si toca aislamiento real.                |
| Cambios DB/migraciones  | `check:migration-duplicates`, `check:hard-delete-allowlist`, `check:legacy-identity-schema`, `scripts/apply-migrations.sh`, `check:cte-regression` | No editar migraciones aplicadas.                                |
| Cambios PDF/bundle      | `npm run build`, `bundle:check`, `check:pdf-runtime-boundaries`, `check:pdf-lazy-entrypoints`, `e2e:pdf-visual`                                    | `check:pdf-lazy-entrypoints` requiere `dist/`.                  |
| Cutover o preview real  | `cutover:preflight`, `cutover:smoke`, `cutover:smoke:isolation`, `e2e:multiuser`                                                                   | Requiere deploy URL y tokens/Clerk segun runner.                |
| Produccion multiusuario | `smoke:production-report`, `smoke:multiuser:prod`, `cleanup:runtime-fixtures`                                                                      | Usar solo con tokens frescos y dejar evidencia en PR/incidente. |
| Debug local             | `bundle:report`, `client-api-contracts:inventory`, `bench:search-scale:portable`, `pr-stack:check`, `generate-pwa-icons.mjs`                       | Herramientas de diagnostico; no todas bloquean merge.           |

## Dominios

| Dominio     | Protege                                                                    | Scripts principales                                                                                              |
| ----------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `api`       | Fronteras cliente/servidor, request parsing y rutas runtime.               | `api-request-contracts`, `runtime-api-routes`, `client-api-contracts`.                                           |
| `auth`      | Estado Clerk/fallback, RLS y contratos de privacidad.                      | `check-legacy-fallback-prod`, `auth-rls-contracts`, `legacy-identity-contracts`.                                 |
| `backend`   | Handlers Netlify y servicios de dominio testeables.                        | `backend-domain-services`.                                                                                       |
| `bundle`    | Budgets gzip, chunks manuales y payload lazy.                              | `check-bundle-size`, `bundle-budget`, `vite-manual-chunks`.                                                      |
| `database`  | Migraciones, soft-delete, CTEs atomicos e integraciones con Postgres real. | `apply-migrations`, `check-migration-duplicates`, `check-hard-delete-allowlist`, `check-legacy-identity-schema`. |
| `docs`      | Runbooks y convenciones que no deben quedar stale.                         | `check-docs-drift`.                                                                                              |
| `frontend`  | Fronteras UI y ownership entre superficies.                                | `check-frontend-boundaries`.                                                                                     |
| `multiuser` | Cutover, smokes productivos, reportes y observabilidad de aislamiento.     | `cutover-*`, `smoke-isolation`, `multiuser-production-report`.                                                   |
| `pdf`       | Runtime PDF, payload lazy, snapshots de bundle y smoke visual dedicado.    | `pdf-runtime-boundaries`, `pdf-lazy-entrypoints`, `pdf-bundle-families`.                                         |
| `test`      | Runners y normalizacion de argumentos de Vitest.                           | `run-vitest`, `vitest-runner-args`.                                                                              |
| `whatsapp`  | Schema y persistencia del puente WhatsApp.                                 | `check-whatsapp-schema`, `gen-whatsapp-cheatsheet`.                                                              |

## Reglas para scripts nuevos

1. Agrega el archivo bajo `scripts/`.
2. Agrega entrada en `SCRIPT_REGISTRY` con dominio, tipo, criticidad,
   `packageScripts` y resumen concreto.
3. Si aparece en `package.json`, el comando debe estar enlazado en esa entrada.
4. Si aparece en `.github/workflows/*`, agrega una entrada en `QUALITY_GATES`.
5. Si el script usa `pathToFileURL(process.argv[1])`, el entrypoint debe tener
   guard en la misma sentencia: `process.argv[1] && ...`. Puede estar
   formateado en varias lineas.
6. Agrega test focalizado cuando el script sea un check, smoke parser o helper
   reutilizable.

## Higiene de workspace local

Los checks de formato usan archivos versionados (`git ls-files`) para evitar que
carpetas locales rompan CI. Mantener fuera del repo:

| Carpeta/artefacto    | Uso                                          |
| -------------------- | -------------------------------------------- |
| `.agents/`           | Skills/agentes locales del usuario.          |
| `.claude/worktrees/` | Worktrees administrados fuera del PR actual. |
| `dist/`              | Build local generado por Vite.               |
| `coverage/`          | Reporte local de coverage.                   |
| `playwright-report/` | Reporte local de Playwright.                 |
| `test-results/`      | Artefactos temporales de E2E.                |
| `node_modules/`      | Dependencias instaladas localmente.          |

No agregues carpetas locales a un allowlist del lint. Si un check necesita leer
archivos del repo, que lea rutas versionadas o patrones explicitos.
