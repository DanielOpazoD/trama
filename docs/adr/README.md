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

| #                                                | Título                                                       | Status   | Date       |
| ------------------------------------------------ | ------------------------------------------------------------ | -------- | ---------- |
| [0001](./0001-neon-http-vs-pool.md)              | Neon HTTP serverless en lugar de connection pool             | Accepted | 2026-05-15 |
| [0002](./0002-zod-runtime-validation.md)         | Zod en bodies de POST/PUT como defense-in-depth              | Accepted | 2026-05-17 |
| [0003](./0003-soft-delete-everywhere.md)         | Soft delete consistente en todas las tablas de dominio       | Accepted | 2026-05-15 |
| [0004](./0004-multi-user-progressive-rollout.md) | Multi-user gradual sin activar Clerk al primer día           | Accepted | 2026-05-26 |
| [0005](./0005-llm-task-routing-per-user.md)      | `ai_task_providers (user_id, task)` para config LLM per-user | Accepted | 2026-05-27 |
| [0006](./0006-error-boundary-granular.md)        | ErrorBoundary granular per-view en ViewRouter                | Accepted | 2026-05-27 |

## Cómo agregar uno

1. Copiar `template.md` a `000N-titulo-en-kebab.md` con el siguiente número.
2. Llenar las secciones honestamente — especialmente "Negative" en Consequences (si no la podés llenar, no entendiste el trade-off).
3. Agregar fila al índice de arriba.
4. PR.
