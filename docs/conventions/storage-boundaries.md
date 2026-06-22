# Storage Boundaries

Trama usa Postgres para datos estructurados y Netlify Blobs para binarios
privados. Desde este PR, todo acceso productivo a blobs pasa por
`netlify/functions/_lib/storage-adapter.ts`.

## Reglas

- El cliente nunca importa `@netlify/blobs`.
- Los handlers y servicios de dominio no importan `@netlify/blobs` directo.
- La unica excepcion productiva es `storage-adapter.ts`.
- Scripts de inventario o dry-run pueden quedar allowlisteados, pero deben ser
  read-only o estar documentados en `scripts/storage-boundaries.mjs`.
- Las keys nuevas usan prefijo de usuario: `${userId}/...`.
- Las keys legacy sin slash pertenecen solo al camino de compatibilidad
  documentado, no a nuevas escrituras.

## Manifest

`storage_assets` es el manifiesto operacional de blobs. No reemplaza las tablas
de dominio, sino que permite auditar y migrar binarios sin hacer scraping de
cada payload.

| Campo                                | Rol                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `user_id`                            | Owner real para aislamiento multiusuario y RLS.                                                                             |
| `domain`                             | Superficie funcional: `notas-attachments`, `recortes-media`, `momentos-media`, `pdf-studio-saved-pdfs`, `pdf-stamp-assets`. |
| `owner_type` / `owner_id`            | Referencia logica al objeto que usa el blob.                                                                                |
| `provider`                           | Provider actual: `netlify-blobs`; `postgres-data-url` solo para firmas/timbres guardados como data URL en Postgres.         |
| `storage_key`                        | Key privada completa; no se loguea en claro.                                                                                |
| `mime_type`, `byte_size`, `checksum` | Metadata minima para auditoria, cleanup y futura migracion.                                                                 |
| `deleted_at`                         | Soft-delete del manifiesto cuando el dominio borra el recurso.                                                              |

## Escrituras nuevas

Toda subida nueva debe:

1. Validar request, MIME y tamano antes de escribir bytes.
2. Resolver usuario autenticado y llamar `ensureUserRow()`.
3. Escribir bytes con `createNetlifyBlobStorageAdapter(store).put(...)`.
4. Registrar `recordStorageAsset(...)` con `checksumSha256(...)`.
5. Si hay borrado logico del dominio, llamar `softDeleteStorageAsset(...)`.

Las firmas/timbres PDF (`pdf_stamp_assets`) todavia no escriben bytes en un
bucket. Se registran con provider `postgres-data-url` y `storage_key` logico
`pdf_stamp_assets/${userId}/${id}` para que el futuro inventario de assets no
los pierda cuando se externalicen.

## Reporte read-only

Para estimar cobertura del manifest antes de una migracion:

```bash
npm run storage-assets:report
```

El comando solo lee `storage_assets`: total por dominio, activos, soft-deleted y
assets sin checksum.

## Huerfanos de storage

Tras las subidas directas a R2, el manifest y el store pueden desincronizarse
(filas sin objeto u objetos sin fila). El inventario read-only y la regla de
lifecycle del bucket para limpiarlos estan documentados en
[`docs/storage-orphans.md`](../storage-orphans.md):

```bash
npm run storage:orphans:dry-run
```

Solo hace `SELECT` + `HEAD` firmado; el veredicto vive en el nucleo puro
`netlify/functions/_lib/storage-orphans.ts`. La limpieza correcta es la regla de
lifecycle del bucket, no un endpoint ni el script.

## Logs

No loguear contenido, nombres completos de archivos sensibles, PDFs, notas,
prompts, tokens, emails ni `storage_key` completo. Si hace falta diagnosticar una
key, usar `storageKeyForLog()`, que emite prefijo de owner y hash.

## Futuro

Este contrato prepara migraciones a otro provider, pero este PR no implementa:

- dual-read;
- migracion masiva de blobs existentes;
- Supabase Storage;
- Session Replay;
- normalizacion global de archivos.

La siguiente etapa deberia ser un dry-run de inventario/migracion que lea el
manifest y estime cobertura por dominio antes de mover bytes.
