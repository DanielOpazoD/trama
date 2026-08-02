# Architecture Decision Records

ADRs documentan decisiones técnicas significativas con su contexto, motivo y trade-offs. Sirven como memoria institucional: cuando alguien pregunta "¿por qué hicieron X?" un año después, la respuesta está acá en vez de en la cabeza del que decidió.

## Cuándo escribir uno

- Cuando una decisión es **costosa de revertir** (esquema DB, modelo de auth, framework del frontend).
- Cuando hay **alternativas plausibles** y elegimos una por razones específicas.
- Cuando la decisión va a **confundir a alguien nuevo** ("¿por qué soft delete en lugar de hard?").

NO escribas un ADR para una decisión obvia o reversible (qué iconos usar, qué color para el botón).

## Formato

Usamos un MADR-lite — ver [`template.md`](./template.md).

## Índice

| #                                                       | Título                                                       | Status   | Date       |
| ------------------------------------------------------- | ------------------------------------------------------------ | -------- | ---------- |
| [0001](./0001-neon-http-vs-pool.md)                     | Neon HTTP serverless en lugar de connection pool             | Accepted | 2026-05-15 |
| [0002](./0002-zod-runtime-validation.md)                | Zod en bodies de POST/PUT como defense-in-depth              | Accepted | 2026-05-17 |
| [0003](./0003-soft-delete-everywhere.md)                | Soft delete consistente en todas las tablas de dominio       | Accepted | 2026-05-15 |
| [0004](./0004-multi-user-progressive-rollout.md)        | Multi-user gradual sin activar Clerk al primer día           | Accepted | 2026-05-26 |
| [0005](./0005-llm-task-routing-per-user.md)             | `ai_task_providers (user_id, task)` para config LLM per-user | Accepted | 2026-05-27 |
| [0006](./0006-error-boundary-granular.md)               | ErrorBoundary granular per-view en ViewRouter                | Accepted | 2026-05-27 |
| [0007](./0007-lazy-loading-per-view.md)                 | Lazy loading per-view en ViewRouter                          | Accepted | 2026-05-27 |
| [0008](./0008-webgl-threshold-sigma.md)                 | SVG vs sigma.js con `WEBGL_THRESHOLD = 1000`                 | Accepted | 2026-05-27 |
| [0009](./0009-extraction-log-single-audit.md)           | `extraction_log` como single audit log para LLM calls        | Accepted | 2026-05-27 |
| [0010](./0010-rls-privacy-boundary.md)                  | RLS como segunda barrera de privacidad, no cero-conocimiento | Accepted | 2026-06-01 |
| [0011](./0011-legacy-identity-cutover.md)               | `legacy-single-user` como compatibilidad, no default DB      | Accepted | 2026-06-21 |
| [0012](./0012-legacy-data-reassignment-dry-run.md)      | Dry-run read-only antes de reasignar datos legacy            | Accepted | 2026-06-21 |
| [0013](./0013-storage-provider-migration-sequencing.md) | Adapter y manifest antes de migrar provider de storage       | Accepted | 2026-06-21 |
| [0014](./0014-multiuser-operational-observability.md)   | Contratos de observabilidad operacional multiusuario         | Accepted | 2026-06-19 |
| [0015](./0015-modo-prueba-backend-en-el-navegador.md)   | El modo prueba es un backend completo en el navegador        | Accepted | 2026-07-31 |
| [0016](./0016-ratchets-estructurales.md)                | Los ficheros grandes llevan un tope que sólo puede bajar     | Accepted | 2026-07-31 |
| [0017](./0017-fallback-solo-ante-fallo-transitorio.md)  | Sólo un fallo transitorio cae al siguiente proveedor de LLM  | Accepted | 2026-07-31 |

## Cómo agregar uno

1. Copiar `template.md` a `000N-titulo-en-kebab.md` con el siguiente número.
2. Llenar las secciones honestamente — especialmente "Negative" en Consequences (si no la podés llenar, no entendiste el trade-off).
3. Agregar fila al índice de arriba.
4. PR.
