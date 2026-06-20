# Quality Gates

Los gates de Trama se dividen por momento operacional. La fuente ejecutable de
scripts y comandos CI vive en `scripts/script-registry.mjs`; esta matriz explica
que protege cada grupo y que hacer si falla.

## Matriz

| Momento          | Gate/comando                                                                                                             | Protege                                                        | Si falla                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Antes de commit  | `npm run format:check`, tests focalizados                                                                                | Estilo y regresiones cercanas al cambio.                       | Corregir localmente antes de push.                                      |
| Lint CI          | `npm run lint`, `npm run check:docs-drift`, `npm run check:script-registry`                                              | Calidad estatica, docs no stale y mapa operacional vigente.    | No mergear; actualizar codigo, docs o registry.                         |
| Auth/privacidad  | `check:legacy-fallback`, `check:auth-rls-contracts`, `check:operational-observability`                                   | Produccion estricta, RLS, ownership y observabilidad sensible. | Bloquear merge hasta explicar el cambio de contrato.                    |
| API/backend      | `check:runtime-api-routes`, `check:api-request-contracts`, `check:backend-domain-services`, `check:client-api-contracts` | Wrappers Netlify, parsing, servicios y uso cliente de API.     | Arreglar frontera o documentar excepcion en el script correspondiente.  |
| Data/migraciones | `check:hard-delete-allowlist`, `check:migration-duplicates`, `scripts/apply-migrations.sh`, `check:cte-regression`       | Soft-delete, orden de migraciones y SQL real.                  | No editar migraciones aplicadas; crear migracion nueva o ajustar SQL.   |
| Estructura       | `check:structure-ratchets`, `check:frontend-boundaries`                                                                  | Hotspots y fronteras frontend.                                 | Reducir archivo/superficie o subir ratchet con justificacion en PR.     |
| Unit/build       | `npm run typecheck`, `npm test`, `npm run test:coverage`, `npm run build`                                                | Tipos, tests, coverage y build productivo.                     | Corregir antes de revisar deploy preview.                               |
| Bundle/PDF       | `check-bundle-size.mjs`, `check:pdf-runtime-boundaries`, `check:pdf-lazy-entrypoints`, `e2e:pdf-visual`                  | Payload inicial, payload lazy PDF y smoke visual de Imprenta.  | Revisar imports, chunks, loaders PDF y budgets antes de subir limites.  |
| E2E              | `npm run e2e`, `npm run e2e:install`                                                                                     | Smoke UI base y accesibilidad.                                 | Reproducir localmente con Playwright antes de merge.                    |
| Secrets          | `gitleaks detect`                                                                                                        | Secretos commiteados en historial.                             | Rotar secreto si aplica y limpiar historial segun runbook de incidente. |
| WhatsApp         | `check:whatsapp-schema`, `test:whatsapp-it`                                                                              | Schema y persistencia real del puente WhatsApp.                | Revisar migraciones y helpers `_lib/whatsapp`.                          |
| Cutover          | `cutover:preflight`, `cutover:smoke`, `cutover:smoke:isolation`                                                          | Auth productivo, tokens, aislamiento A/B y rutas runtime.      | No promover deploy; usar `docs/runbook-multiusuario.md`.                |
| Produccion       | `smoke:production-report`, `smoke:multiuser:prod`                                                                        | Evidencia reproducible de privacidad y salud operacional.      | Abrir incidente o rollback plan; dejar reporte en PR/incidente.         |

## Convenciones

- Todo script operacional nuevo debe estar en `SCRIPT_REGISTRY`.
- Todo comando de GitHub Actions que use `npm run`, `npm test`, `node scripts/*`
  o `scripts/*.sh` debe estar en `QUALITY_GATES`.
- Los smokes productivos deben declarar prerequisitos en docs/runbook antes de
  usarse como evidencia de merge.
- Los scripts CLI que comparan `import.meta.url` con
  `pathToFileURL(process.argv[1])` deben proteger `process.argv[1]` antes de
  llamar a `pathToFileURL()` en la misma sentencia. El guard puede estar
  formateado en varias lineas.
- No se crea un runner universal: `npm scripts` sigue siendo la interfaz
  publica para humanos y CI.
