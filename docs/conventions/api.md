# API — patrones de endpoints + schemas Zod + tipos

## Schemas compartidos (Zod, FF2)

Las shapes que cruzan cliente↔servidor viven en `src/schemas/`:

- `src/schemas/momento.ts` — payload por kind + `validateMomentoPayload(kind, payload)`
- `src/schemas/proposal.ts` — propuestas IA (ProposedEntity, ProposedQuote, etc.)

Tipos en `src/types/` (G1: split por dominio) que tenían copias duplicadas server-side ahora se infieren con `z.infer` desde estos schemas. Si necesitás validación en runtime (cliente pre-submit, server input check), importá la schema y usá `.safeParse()`. Si solo necesitás los types, importá desde `../types` como siempre — la fuente de verdad cambió por abajo, los call sites no.

**Cuándo usar Zod**: para shapes que se reciben de fuera (input usuario, response LLM, body de request) y donde un fail-fast con mensaje claro vale más que rescatar parcialmente. **Cuándo NO**: para "cleaners" que filtran items malos de un array (ej. `_lib/extract-validate.ts`) — ahí Zod no ayuda, mantenelo manual.

## Patrón de añadir un nuevo endpoint

1. Crea `netlify/functions/<name>.mts` con default export y `config.path`.
2. Importa `getSql` desde `./_lib/db.js`; instánciala dentro del handler.
3. Wrap el handler con `withObservability('<name>', async (req, _ctx, { requestId }) => {...})`. El tercer arg trae el `requestId` que tenés que pasar a cualquier respuesta de error (ver punto 5).
4. Para GET/POST/PATCH/DELETE en el mismo path, branch por `req.method`.
5. **Errores SIEMPRE via `ApiErrors`** (de `./_lib/api-error.js`). Nunca `new Response('texto', { status: 4xx })` directo. El shape canónico es `{ error: { code, message, requestId, details? } }` y se devuelve con header `x-request-id`. Helpers disponibles: `validation`, `notFound`, `conflict`, `methodNotAllowed`, `rateLimited`, `aiDisabled`, `payloadTooLarge`, `unsupportedMediaType`, `unprocessable`, `upstream`, `internal`. El cliente parsea esto y tira `ApiClientError` con `code`/`message`/`requestId` accesibles.
6. **Mutaciones privadas verifican filas afectadas.** En `PATCH`, `DELETE`, restore y acciones equivalentes sobre tablas con `user_id`, el SQL debe hacer `RETURNING` o un CTE que permita saber si la fila primaria se tocó. Si el resultado viene vacío, responde `ApiErrors.notFound(...)`. No devuelvas 200/204 cuando no se mutó nada: eso oculta recursos ajenos, IDs malos y drift operacional.
7. **Requests privados con contrato explícito.** Si la ruta parsea method, query params o multipart/form-data en una superficie privada de alto riesgo, usa `netlify/functions/_lib/request-contracts.ts`:
   - `requireMethod(req, requestId, ['GET'])` para 405 con `Allow`.
   - `parseSearchParams(req, Schema, requestId)` para query params Zod con `details.issues`.
   - `readFormData(req, requestId)` + `parseFormFields(...)` para uploads antes de tocar blobs.
8. Agrega el cliente en `src/api/`.
9. Si hay UI, hook en `src/state/` (con TanStack Query).
10. Test al menos la lógica pura (prompts, validators, transforms) en `*.test.ts`.

## Matriz de contratos de request

| Superficie                      | Helper obligatorio                                   | Motivo operacional                                           |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| `search`                        | `requireMethod` + `parseSearchParams`                | Evita SQL/embeddings/LLM con query ambigua o método inválido |
| `notes` GET                     | `parseSearchParams`                                  | Normaliza búsqueda/tag antes de consultar datos privados     |
| `recortes` GET                  | `parseSearchParams`                                  | Mantiene filtros compatibles pero explícitos                 |
| `momentos` GET list             | `parseSearchParams`                                  | Valida paginación/cursor antes del timeline privado          |
| `notas-attachments` GET         | `parseSearchParams`                                  | Valida owner antes del lookup de propiedad                   |
| `notas-attachments-upload` POST | `requireMethod` + `readFormData` + `parseFormFields` | Falla antes de blobs/metadata con errores canónicos          |

`npm run check:api-request-contracts` bloquea drift en estas superficies. No es una prohibición global de `URLSearchParams`: rutas simples o públicas pueden seguir manuales si no están en la matriz. Para sumar una superficie, agrega el endpoint al script con una razón corta y un test que demuestre el helper en una ruta real.

Para mutaciones privadas, ver también
[`mutation-contracts.md`](./mutation-contracts.md): matriz de acción → status →
error shape → side effects.

> **Duplicados de entidades:** `/api/entities` POST usa el patrón canónico con `ApiErrors.conflict(...)`. Para conservar la UX específica, el servidor pone `details: { kind: 'possible_duplicate', suggestions: [...] }` y el cliente lo transforma en `DuplicateEntityError`. El parser legacy `{ error: 'possible_duplicate', suggestions }` queda solo para compatibilidad con despliegues antiguos.

## Patrón de añadir un nuevo tipo (entidad o relación)

**Vía migración nueva.** Insertás en `entity_types` o `relationship_types` con `ON CONFLICT (slug) DO NOTHING` para idempotencia. El extractor, suggest, reclassify y chat leen los tipos en runtime — ningún código React hace falta cambiar.

Considera actualizar el fallback en `src/types/entity.ts` (`ENTITY_TYPES`) o `src/types/relationship.ts` (`RELATIONSHIP_TYPES`) y en `GraphNode.tsx` (`TYPE_ACCENT`) para que el select manual y el color del nodo reflejen el tipo nuevo. Estos son fallbacks visuales, no autoridad.
