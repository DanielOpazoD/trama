# Client API Contracts

Este contrato ordena la frontera entre React y `/api/*`. La regla central es
simple: los componentes no interpretan respuestas HTTP privadas a mano. El
transporte vive en `src/api/request.ts`; las excepciones quedan inventariadas y
testeadas.

## Objetivo

Reducir tres clases de deuda:

- Descargas privadas que olvidan `Authorization` y fallan en multiusuario.
- Errores `new Error("status")` que pierden `code`, `requestId` y contexto.
- `fetch()` directo creciendo por costumbre en componentes.

No introduce store global, event bus, normalización de cache ni framework nuevo.
Es un contrato de borde pequeño, ejecutable y fácil de revisar.

## Helpers Permitidos

| Helper              | Devuelve                            | Uso correcto                                                      | No usar para                                |
| ------------------- | ----------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| `request<T>()`      | JSON tipado                         | CRUD normal de endpoints propios                                  | Blobs, streaming o `Response.body`          |
| `requestResponse()` | `Response` ya validado              | Casos raros que necesitan headers/body                            | Componentes de UI comunes                   |
| `requestBlob()`     | `Blob`                              | Media privada, anexos, imágenes internas                          | URLs externas o `blob:`                     |
| `apiFetch()`        | `Response` crudo con headers auth   | Streaming, fire-and-forget, protocolos especiales                 | Descargas privadas con `response.ok` manual |
| `fetch()`           | `Response` crudo sin contrato Trama | Fuentes externas, bitmaps browser-only, fallback legacy explícito | Cualquier `/api/*` privado nuevo            |

## Matriz Por Superficie

| Superficie                    | Ruta                            | Helper                         | Dueño del contrato                     | Test/guardrail                                            |
| ----------------------------- | ------------------------------- | ------------------------------ | -------------------------------------- | --------------------------------------------------------- |
| Anexos de nota/tarea          | `/api/notas-attachments-file/*` | `requestBlob()`                | `AttachmentsPanel`, `AttachmentPhotos` | `AttachmentsPanel.test.tsx`, `client-api-contracts.mjs`   |
| Miniaturas autenticadas       | `/api/notas-attachments-file/*` | `useAuthenticatedMediaState()` | `AuthenticatedMedia`                   | `AuthenticatedMedia.test.tsx`                             |
| Media de Momentos             | `/api/momentos-file/*`          | `requestBlob()`                | `AuthenticatedMedia`, `FotoEditModal`  | `AuthenticatedMedia.test.tsx`, `client-api-contracts.mjs` |
| Fallback Momentos legacy      | `/api/momentos-file/<legacy>`   | `fetch()` allowlisteado        | `AuthenticatedMedia`                   | `AuthenticatedMedia.test.tsx`                             |
| Imágenes de Recortes internas | `/api/recortes-image/*`         | `requestBlob()`                | `RecorteCard`, import a Imprenta       | `recortesToPdfFiles.test.ts`, guardrail                   |
| Imagen externa de Recorte     | `https://...`                   | `fetch()` allowlisteado        | `RecorteCard`                          | Guardrail por conteo exacto                               |
| Exportar fotos                | URLs privadas de anexos         | `requestBlob()`                | `photoExport`                          | `photoExport.test.ts`                                     |
| Importar recortes a PDF       | `/api/recortes-image/*`         | `fetchBlob` inyectado          | `NotasWorld` + helper puro             | `recortesToPdfFiles.test.ts`                              |
| Fuentes PDF/Libro             | URL de fuente                   | `fetch()` allowlisteado        | `assembleFonts`, `buildLibro`          | Guardrail por conteo exacto                               |
| Bitmap object-url             | `blob:`/URL temporal            | `fetch()` allowlisteado        | `usePdfStudioPageActions`              | Guardrail por conteo exacto                               |

## Contrato De Errores

Las respuestas non-2xx propias deben pasar por el parser de `request.ts`.

| Respuesta servidor                                 | Error cliente          | Propiedades preservadas                             |
| -------------------------------------------------- | ---------------------- | --------------------------------------------------- |
| `{ error: { code, message, requestId, details } }` | `ApiClientError`       | `code`, `status`, `message`, `requestId`, `details` |
| `/api/entities` 409 duplicado                      | `DuplicateEntityError` | `suggestions`                                       |
| Texto plano legacy                                 | `ApiClientError`       | `status`, `message`, `requestId` si existe          |
| Blob privado 401/404                               | `ApiClientError`       | Necesario para fallback legacy acotado              |

Un componente puede mostrar `err.message`, pero no debe reconstruir el error
desde `response.status` si el endpoint es propio.

## Allowlist De `fetch()`

Las listas viven en `scripts/client-api-contracts.mjs` y deben ser pequeñas.
`DIRECT_FETCH_ALLOWLIST` cubre `fetch()` sin contrato Trama. `RAW_API_FETCH_ALLOWLIST`
cubre `apiFetch()` crudo cuando el consumidor necesita `Response` real.
Cada entrada declara:

- `file`: ruta exacta del consumidor.
- `count`: número exacto de `fetch()` directos permitidos.
- `reason`: por qué no debe pasar por `request.ts`.
- `requires`: texto que demuestra que la excepción sigue acotada.

Allowlist actual:

| Archivo                                                           | Fetches | Razón                    |
| ----------------------------------------------------------------- | ------: | ------------------------ |
| `src/api/request.ts`                                              |       1 | Transporte central       |
| `src/lib/libro/buildLibro.ts`                                     |       1 | Fuente externa           |
| `src/lib/pdfStudio/assemble/assembleFonts.ts`                     |       1 | Fuente externa           |
| `src/components/recortes/RecorteCard.tsx`                         |       1 | `imageUrl` externa       |
| `src/components/momentos/AuthenticatedMedia.tsx`                  |       1 | Fallback legacy Momentos |
| `src/components/notas/pdfStudio/shell/usePdfStudioPageActions.ts` |       1 | Bitmap browser-only      |

Allowlist actual de `apiFetch()` crudo:

| Archivo                          | Llamadas | Razón                               |
| -------------------------------- | -------: | ----------------------------------- |
| `src/api/chat.ts`                |        1 | Streaming de respuesta de chat      |
| `src/lib/clientErrorTracking.ts` |        1 | Telemetría fire-and-forget          |
| `src/lib/webVitals.ts`           |        1 | Métricas web-vitals fire-and-forget |

Si aparece un nuevo `fetch()`, el PR debe elegir una de dos rutas:

1. Mover el caso a `request<T>`, `requestResponse()` o `requestBlob()`.
2. Agregar una entrada al allowlist con razón específica y test que cubra el
   comportamiento.

Si aparece un nuevo `apiFetch()`, la barra es parecida pero más estricta: debe
necesitar `Response.body`, headers crudos o una llamada fire-and-forget. Para
CRUD JSON o blobs privados, usar el helper de nivel más alto.

## Inventario Ejecutable

Comandos:

```bash
npm run check:client-api-contracts
npm run client-api-contracts:inventory
```

El primero falla CI si el contrato se rompe. El segundo imprime JSON para
auditoría o debugging:

```json
{
  "generatedBy": "scripts/client-api-contracts.mjs",
  "requestExports": {
    "apiFetch": true,
    "request": true,
    "requestResponse": true,
    "requestBlob": true,
    "apiClientError": true
  },
  "summary": {
    "directFetchFiles": 6,
    "allowedDirectFetchFiles": 6,
    "rawApiFetchFiles": 3,
    "allowedRawApiFetchFiles": 3,
    "privateBlobConsumers": 8,
    "privateBlobConsumersOk": 8
  }
}
```

El JSON no se commitea como snapshot porque puede cambiar con rutas legítimas;
el contrato que sí bloquea merge es el script.

## Cómo Agregar Un Blob Privado Nuevo

1. Crear endpoint en `netlify/functions/*` con `ApiErrors` canónico.
2. Exponer URL desde transform/API cliente sin descargar el blob.
3. En UI, llamar a `requestBlob(url)` o al hook `useAuthenticatedMediaState()`.
4. Si el helper es puro, inyectar `fetchBlob` desde el borde React.
5. Agregar test del consumidor.
6. Agregar el consumidor a `PRIVATE_BLOB_CONTRACTS` si es una superficie estable.

Ejemplo preferido:

```ts
const blob = await requestBlob(photo.url)
const file = new File([blob], photo.fileName, { type: blob.type || photo.mimeType })
```

Ejemplo para helper puro:

```ts
await recortesToPdfFiles(recortes, { fetchBlob: requestBlob })
```

Evitar:

```ts
const response = await apiFetch(photo.url)
if (!response.ok) throw new Error(`HTTP ${response.status}`)
const blob = await response.blob()
```

Ese patrón pierde el shape canónico de error y tiende a duplicarse.

## Reglas De Revisión

Cuando un PR toca descargas, media o anexos, revisar:

- ¿La ruta es propia y privada? Entonces usa `requestBlob()`.
- ¿Necesita streaming real? Entonces `apiFetch()` está bien, pero debe estar
  justificado por el uso de `Response.body` o headers.
- ¿Es URL externa? Puede usar `fetch()`, pero si vive en `src/` debe estar en el
  allowlist.
- ¿El error visible al usuario conserva `message` canónico?
- ¿El test falla si alguien vuelve a `apiFetch(...).blob()` manual?

## Casos Deliberadamente Fuera

- No convierte `CommandPalette`, búsqueda ni editores a TanStack Query.
- No cambia contratos servidor ni rutas Netlify.
- No elimina fallback legacy de Momentos; solo lo deja acotado.
- No cachea blobs ni introduce retry global.
- No añade un downloader común de UI; `requestBlob()` basta por ahora.

## Troubleshooting

### `usa fetch() directo`

El archivo no está en allowlist. Antes de allowlistearlo, revisar si la URL es
propia:

```ts
await requestBlob('/api/notas-attachments-file/u/foto.jpg')
```

Si la URL es externa, agregar allowlist con conteo exacto y razón:

```js
{
  file: 'src/components/recortes/RecorteCard.tsx',
  count: 1,
  reason: 'external imageUrl fallback only',
}
```

### `declara 1 fetch() pero tiene 2`

La excepción creció. Esto suele significar que un fallback empezó a hacer más
trabajo del previsto. Separar el nuevo caso y decidir si:

- Usa `requestBlob()` porque es endpoint propio.
- Usa `requestResponse()` porque necesita headers.
- Merece otra excepción con test específico.

### `debe contener requestBlob(...)`

El consumidor privado dejó de usar el helper. Restaurar el helper o, si el
archivo cambió de responsabilidad, actualizar `PRIVATE_BLOB_CONTRACTS` con la
nueva ruta. No borrar el contrato sin mover el test equivalente.

### `no debe contener apiFetch(...)`

`apiFetch()` sigue permitido, pero no para bajar blobs privados y reconstruir
errores a mano. En descargas privadas, el equivalente casi siempre es:

```ts
const blob = await requestBlob(url)
```

### `usa apiFetch() crudo`

El archivo está usando el transporte crudo directamente. Elegir el helper más
estrecho:

```ts
await request('/api/notes')
await requestBlob('/api/notas-attachments-file/u/foto.jpg')
```

Solo allowlistear si el código necesita `Response.body`, headers crudos o una
llamada fire-and-forget documentada.

### Falla Solo En CI

El script solo lee archivos versionados en `src/`. Si falla en CI y no local:

1. Confirmar que el branch remoto incluye el archivo nuevo.
2. Correr `npm run client-api-contracts:inventory` y revisar `directFetches`.
3. Revisar si el PR se basó en una rama que movió un consumidor.
4. Evitar arreglar con una excepción genérica; el allowlist debe nombrar el
   archivo exacto y la razón exacta.
