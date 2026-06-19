# Mutation Contracts

Este contrato cubre mutaciones privadas en endpoints de Notas, Recortes,
Momentos y anexos. La meta no es crear un framework nuevo: es que cada acción
operacional sea trazable, testeable y reversible cuando corresponde.

## Reglas

- Toda respuesta `4xx`/`5xx` usa `ApiErrors.*`.
- El body de error es `{ error: { code, message, requestId, details? } }`.
- El header `x-request-id` debe estar presente en respuestas exitosas y de error.
- `PATCH`, `DELETE`, restore, promote/unpromote y acciones equivalentes deben
  comprobar filas afectadas con `RETURNING` o CTE.
- Un `DELETE` privado que no toca filas responde `404`, no `200` con no-op.
- Si la tabla tiene `deleted_at`, el borrado es soft-delete. No uses `DELETE FROM`.
- Restore recibe el `deletedAt` exacto que devolvió el delete. Si no matchea,
  responde `404` cuando el recurso queda indistinguible de inexistente, o `409`
  cuando el contrato operativo necesita señalar stale restore/version drift.
- El cliente transforma snake_case a camelCase solo en `src/api/*`.
- Clientes con undo no deben convertir un `deletedAt` ausente a `null`: eso
  es drift server-cliente y debe fallar explícitamente antes de ofrecer deshacer.

## Matriz

| Acción            | Endpoints                            | Success                  | Error esperado                    | Side effects                                      |
| ----------------- | ------------------------------------ | ------------------------ | --------------------------------- | ------------------------------------------------- |
| Create note       | `POST /api/notes`                    | `201` row                | `400 VALIDATION`                  | `ensureUserRow`, tags derivadas                   |
| Update note       | `PATCH /api/notes/:id`               | `200` row                | `404 NOT_FOUND` si no toca fila   | tags se recalculan si cambia content              |
| Delete note       | `DELETE /api/notes/:id`              | `200 { deletedAt }`      | `404 NOT_FOUND`                   | soft-delete nota y anexos con mismo `deleted_at`  |
| Restore note      | `POST /api/notes/:id/restore`        | `200 { restored: true }` | `404 NOT_FOUND`                   | revive nota y anexos con `deletedAt` exacto       |
| Promote note      | `POST /api/notes/:id/promote`        | `201 { momentoId }`      | `400 VALIDATION`, `404 NOT_FOUND` | crea Momento y marca `promoted_momento_id`        |
| Create recorte    | `POST /api/recortes`                 | `201` row                | `400 VALIDATION`                  | persiste captura con owner actual                 |
| Update recorte    | `PATCH /api/recortes/:id`            | `200` row                | `404 NOT_FOUND`                   | cambia estado/texto/metadata permitida            |
| Delete recorte    | `DELETE /api/recortes/:id`           | `200 { deletedAt }`      | `404 NOT_FOUND`                   | soft-delete del recorte                           |
| Restore recorte   | `POST /api/recortes/:id/restore`     | `200 { restored: true }` | `404 NOT_FOUND`                   | revive solo si `deletedAt` matchea                |
| Promote recorte   | `POST /api/recortes/:id/promote`     | `200` row                | `400 VALIDATION`, `404 NOT_FOUND` | crea quote/entity/momento y marca destino         |
| Unpromote recorte | `POST /api/recortes/:id/unpromote`   | `200` row                | `404 NOT_FOUND`                   | soft-delete del destino creado y vuelve a pending |
| Create momento    | `POST /api/momentos`                 | `201` row                | `400 VALIDATION`, `404 NOT_FOUND` | crea Momento y links en CTE                       |
| Update momento    | `PATCH /api/momentos/:id`            | `200` row                | `400 VALIDATION`, `404 NOT_FOUND` | edita contenido permitido y links                 |
| Delete momento    | `DELETE /api/momentos/:id`           | `200 { deletedAt }`      | `404 NOT_FOUND`                   | soft-delete del Momento                           |
| Restore momento   | `POST /api/momentos-restore`         | `200` row                | `400 VALIDATION`, `409 CONFLICT`  | revive solo con `deletedAt` exacto                |
| Upload momento    | `POST /api/momentos-upload`          | `200 { storageKey }`     | `400`, `413`, `415`               | escribe blob privado en `momentos-media`          |
| Upload audio      | `POST /api/momentos-audio-upload`    | `200 { storageKey }`     | `400`, `413`, `415`               | escribe audio privado en `momentos-media`         |
| Upload recorte    | `POST /api/recortes-image-upload`    | `200 { imageKey }`       | `400`, `413`, `415`               | escribe media privada en `recortes-media`         |
| Upload attachment | `POST /api/notas-attachments-upload` | `201` row                | `400`, `404`, `413`, `415`        | escribe blob y fila metadata                      |
| Delete attachment | `DELETE /api/notas-attachments/:id`  | `200 { ok: true }`       | `404 NOT_FOUND`                   | soft-delete del anexo                             |

## Uploads privados

| Endpoint                             | Store               | MIME allowlist                         | Límite | Respuesta        | Razón operacional                                      |
| ------------------------------------ | ------------------- | -------------------------------------- | ------ | ---------------- | ------------------------------------------------------ |
| `POST /api/momentos-upload`          | `momentos-media`    | jpeg, png, webp, gif                   | 10 MB  | `{ storageKey }` | Fotos de Momento namespaced por usuario                |
| `POST /api/momentos-audio-upload`    | `momentos-media`    | mp3, m4a, aac, ogg, webm, wav          | 10 MB  | `{ storageKey }` | Notas de voz servidas por el endpoint de media privada |
| `POST /api/recortes-image-upload`    | `recortes-media`    | jpeg, png, webp, gif, mp4, webm, mov   | 10 MB  | `{ imageKey }`   | Capturas visuales o video de Recortes                  |
| `POST /api/notas-attachments-upload` | `notas-attachments` | docs, texto, csv, json, pdf, zip, imgs | 20 MB  | attachment row   | Metadata derivada alimenta Notas feed y búsqueda       |

## Guardrail

Los endpoints de mutación principales están cubiertos por
`netlify/functions/_lib/mutation-contracts-guardrail.test.ts`. Si un endpoint
necesita salir de este contrato, documenta la razón en este archivo y agrega una
excepción explícita en el test.
