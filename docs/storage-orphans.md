# Inventario de huérfanos de storage (read-only)

Tras agregar subidas directas a R2 (la Biblioteca PUTea con URL presignada y luego
llama a `complete`), el manifest `storage_assets` y el store real pueden quedar
desincronizados. Hay dos clases de huérfano:

- **(a) Manifest sin objeto:** una fila viva de `storage_assets` cuyo objeto NO
  existe en el store. Pasa si un `complete` registró la fila pero el PUT del
  cliente nunca llegó, o si un borrado parcial dejó la fila.
- **(b) Objeto sin manifest:** un objeto en el store sin fila de manifest. Pasa si
  un PUT presignado se subió pero el cliente nunca llamó a `complete`.

Esto NO se puede chequear de forma estática: necesita la DB y/o el store. Por eso
no es un gate de CI sino un **script operativo read-only**, hermano del dry-run de
reasignación legacy.

Importante: una key legacy sin namespace de usuario no es un huérfano por defecto.
Este inventario responde "manifest vs objeto". La pregunta "a qué dueño real se
reasigna esta key histórica" vive en `npm run legacy-data-reassignment:dry-run`.
Antes de copiar, renombrar o borrar media legacy, cruzar ambos reportes: storage
orphans para consistencia técnica del store, legacy reassignment para ownership y
riesgo de cutover.

## Cómo correr el inventario

```bash
npm run storage:orphans:dry-run            # reporte Markdown
npm run storage:orphans:dry-run -- --json  # JSON para pipelines
```

Flags: `--provider=r2` (default), `--max-probes=<n>` (tope de HEADs por corrida,
default 500).

Requiere las mismas env vars que el runtime:

- `DATABASE_URL` o `NETLIFY_DB_URL` para leer `storage_assets` (solo `SELECT`).
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` para los
  HEAD firmados.

El script lee el manifest activo (`deleted_at IS NULL`) del provider, comprueba la
existencia de cada objeto con un HEAD firmado (`r2ObjectExists`, el mismo helper
del endpoint de complete) y delega el veredicto al núcleo puro
`netlify/functions/_lib/storage-orphans.ts`. No imprime keys completas: las
sanitiza a `ownerPrefix/…#hash`.

### Garantía read-only

El runner solo hace `SELECT` en DB y `HEAD` en R2. No contiene —ni debe agregarse—
ningún `DELETE`/`UPDATE`/`PUT`. La limpieza correcta no es un endpoint ni este
script, sino la **regla de lifecycle del bucket** (abajo).

### Limitación de enumeración (categoría b)

Detectar (b) requiere ENUMERAR el store. `r2.ts` no expone un `LIST` firmado y este
script no lista R2 read-only, así que la corrida cruza el manifest contra HEADs:
confirma de forma fiable la categoría **(a)**, pero `objectsWithoutManifest` queda
vacío porque toda key sondeada proviene de una fila. La detección operativa de (b)
recae en la **regla de lifecycle** del bucket, que caduca los objetos incompletos
sin depender de un escaneo. Para netlify-blobs el adapter tampoco expone un `exists`
read-only por objeto, así que ese provider no se sondea desde acá. Si más adelante
se agrega un `LIST` firmado, basta alimentar esas keys a `presentKeys`: el núcleo
puro ya las clasifica como (b).

## Regla de lifecycle del bucket R2 (limpieza correcta)

En vez de borrar objetos huérfanos desde un endpoint o este script (riesgoso y
fuera de contrato), se configura una **regla de lifecycle** en el bucket R2 que
caduca los objetos no confirmados tras N días. Es la forma idempotente y segura de
limpiar (b): si un PUT presignado nunca llamó a `complete`, el objeto desaparece
solo.

Recomendado: caducar a los 7 días los objetos bajo el prefijo de subidas. Aplicar
con `wrangler r2 bucket lifecycle` o el dashboard de Cloudflare; el bucket debe
contener solo subidas presignadas confirmables (las keys usan prefijo de usuario
`${userId}/...`).

```json
{
  "rules": [
    {
      "id": "expire-incomplete-uploads",
      "enabled": true,
      "conditions": { "prefix": "" },
      "abortIncompleteMultipartUpload": { "daysAfterInitiation": 1 },
      "expiration": { "daysAfterCreation": 7 }
    }
  ]
}
```

- `abortIncompleteMultipartUpload.daysAfterInitiation: 1`: aborta multipart a
  medias al día (no dejan objeto legible pero ocupan).
- `expiration.daysAfterCreation: 7`: caduca el objeto 7 días después de creado. La
  ventana debe superar de sobra el ciclo `presign → PUT → complete` (segundos),
  así un objeto confirmado y registrado nunca se caduca por accidente: si tiene
  fila de manifest viva, ya se sirve y el dominio controla su borrado lógico; la
  regla solo barre lo que quedó sin confirmar.

> Nota: la forma exacta del JSON depende de cómo se aplique (API S3
> `PutBucketLifecycleConfiguration` vs `wrangler`). Lo esencial es: abortar
> multipart incompletos pronto y caducar objetos tras N>1 días, NUNCA borrar desde
> código de la app.

## Qué hacer con cada categoría

| Categoría               | Significado                      | Acción                                                                                                                                                       |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Manifest sin objeto (a) | Fila viva sin objeto en el store | Revisar la fila; si el objeto se perdió, soft-deletear por el **camino de dominio** (`softDeleteStorageAsset` / el DELETE del dominio), nunca `DELETE FROM`. |
| Objeto sin manifest (b) | Objeto en el store sin fila      | No borrar a mano. Lo caduca la **regla de lifecycle**. Si reaparece seguido, revisar por qué el cliente no llama a `complete`.                               |
| ok                      | Fila con objeto presente         | Nada. Estado sano.                                                                                                                                           |

Ver también [`docs/conventions/storage-boundaries.md`](conventions/storage-boundaries.md)
para el contrato del manifest y la frontera del adapter.
