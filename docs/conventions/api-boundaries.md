# API boundaries

Este documento complementa `docs/conventions/api.md` con la frontera operativa de
Netlify Functions. La regla base: el archivo público en `netlify/functions/*.mts`
debe ser un wrapper fino; la lógica vive en `netlify/functions/_lib/*-endpoint.ts`.

## Wrapper fino

Para endpoints con más de una rama HTTP, SQL no trivial, IA, blobs o varias
mutaciones, usa este patrón:

```ts
import type { Config } from '@netlify/functions'

import handler from './_lib/example-endpoint.js'

export const config: Config = {
  path: ['/api/example', '/api/example/:id'],
}

export default handler
```

El módulo `_lib/example-endpoint.ts` contiene `withObservability(...)`, importa
`getAuthedUser()` e instancia `getSql()` dentro del handler. `config.path` vive
en `netlify/functions/*.mts`, no en `_lib`, porque Netlify debe poder descubrir
la ruta pública `/api/*` desde el archivo función desplegable. Delegar el handler
es correcto; delegar la configuración de ruta no.

Regla corta: `config.path` vive en `netlify/functions/*.mts`.

Así los tests pueden ejercitar la lógica sin agrandar la superficie Netlify.

## Contratos de error

Toda respuesta 4xx/5xx debe salir por `ApiErrors.*`, con shape:

```json
{ "error": { "code": "VALIDATION", "message": "...", "requestId": "..." } }
```

No uses `new Response('texto', { status: 4xx })` ni
`Response.json(..., { status: 4xx })` fuera de `_lib/api-error.ts` y
`_lib/handler-wrap.ts`. `withObservability` agrega `x-request-id` también a las
respuestas felices.

## Tests mínimos por endpoint privado

Cada endpoint crítico debe cubrir, al menos:

- Método no permitido con `ApiErrors.methodNotAllowed`.
- Body inválido o query inválida con `ApiErrors.validation`.
- Recurso inexistente o ajeno con `ApiErrors.notFound`.
- Mutación privada que prueba filas afectadas con `RETURNING` o CTE equivalente.
- Queries sobre tablas con `deleted_at` usando `deleted_at IS NULL`.
- Writes con `user_id` precedidos por `ensureUserRow()` cuando aplique.
- Una respuesta feliz mínima que fije shape y campos relevantes.

Los tests de integración mockeados viven en `netlify/functions/_lib/*.test.ts`
porque Netlify interpreta archivos `.test.ts` directamente bajo
`netlify/functions/` como funciones inválidas.

## Ratchets

Los wrappers críticos deben quedar bajo `server-api-wrappers` y los handlers
extraídos bajo `server-api-endpoints` en `scripts/structure-ratchets.mjs`.
Si un handler supera su ratchet, extrae una responsabilidad interna o sube el
límite con justificación explícita en el mismo PR.

### Fronteras compuestas

Cuando un endpoint extraído sigue creciendo, no lo vuelvas a mover entero a otro
archivo. Divide por intención:

- `*-endpoint.ts`: auth, routing HTTP, parseo de body/query y respuestas
  canónicas.
- `*-crud.ts`: SQL CRUD/list/restore/delete de una entidad.
- `*-suggest.ts` o equivalente: flujos IA advisory que no mutan el recurso.
- `*-service.ts`: builders puros, normalizadores y transforms sin `getSql()`.

Ejemplo actual:

- `netlify/functions/whatsapp-webhook.mts`: wrapper con `config.path`.
- `netlify/functions/_lib/whatsapp/webhook-endpoint.ts`: handler observado.
- `netlify/functions/_lib/whatsapp/webhook-interactive-replies.ts`: Content API
  de Twilio y degradación a TwiML.
- `netlify/functions/_lib/recortes-endpoint.ts`: routing + promote/unpromote.
- `netlify/functions/_lib/recortes-crud.ts`: list/create/patch/delete/restore.
- `netlify/functions/_lib/recortes-suggest.ts`: sugerencia IA de curaduría.

## Fixtures de endpoint

Los tests de endpoints deben preferir los helpers existentes antes de crear mocks
ad hoc:

- `netlify/functions/_lib/test-fixtures.ts`: `TEST_USERS`, `buildUserPair()`,
  `buildApiRequest()`, `buildJsonApiRequest()` y builders de filas.
- `netlify/functions/_lib/test-utils.ts`: `mockContext()`,
  `mockSqlResponses`, `setupMockSql()` y `expectCanonicalError()`.

Para flujos multiusuario, usa `buildUserPair()` o `TEST_USERS.a/b`; para requests
JSON autenticados usa `buildJsonApiRequest()` con `user` o `token`. Así los tests
de aislamiento no inventan headers distintos por archivo.

## Writes con `INSERT ... SELECT`

`npm run check:user-id-writes` debe terminar con `issues: 0` y `warnings: 0`.
Los `INSERT ... SELECT` sobre tablas privadas solo pueden sobrevivir si están en
`USER_ID_WRITE_WARNING_ALLOWLIST` con razón explícita. Esa allowlist no es una
vía para ocultar deuda: cada entrada debe explicar por qué el `user_id` queda
anclado al owner autenticado o a una fila owner-visible.

## Guardrails

`netlify/functions/_lib/isolation-guardrail.test.ts` resuelve wrappers hacia su
handler extraído antes de revisar auth, `user_id`, `deleted_at`,
`withObservability`, `ensureUserRow()` y mutaciones soft-delete. Si agregas otro
wrapper fino, no lo eximas: haz que el resolver encuentre su `_lib/*-endpoint.ts`.
