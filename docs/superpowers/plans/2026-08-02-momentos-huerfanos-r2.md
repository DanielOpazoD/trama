# El barrido de huérfanos de Momentos ve también R2

## Problema

`momentos-orphaned-blobs` detecta media de Momentos que ningún Momento referencia,
pero solo miraba **un** backend: `createNetlifyBlobStorageAdapter('momentos-media')`
y su `.list()`.

Desde la subida directa a R2 (`momentos-uploads-presign` → PUT → `-complete`), la
media de más de 4 MB —los videos— vive en el bucket, no en Netlify Blobs. Por
tanto era **invisible** para el barrido. Un video queda huérfano cuando el PUT a
R2 sale bien pero el momento nunca llega a crearse (el usuario cierra el composer,
la creación falla). Nadie lo detectaba y nadie lo limpiaba; y como son videos, es
justo lo que más ocupa.

## Decisión: enumerar R2 de verdad, no listar `storage_assets`

Había dos caminos. Se eligió el **LIST firmado**, sumado al listado de Blobs que ya
existía, y NO el cruce contra la tabla de manifest. Tres razones, en orden de peso:

1. **Listar `storage_assets` habría regresado la capacidad original (DD1).** Este
   endpoint existe porque los deploy previews levantan una BD Neon efímera: el blob
   iba al store global y el momento quedaba en la BD del preview. `recordStorageAsset`
   escribe en **esa misma BD efímera**, así que la fila del manifest se perdió junto
   con el momento. Listar contra la tabla haría invisibles justo los huérfanos para
   los que se construyó el endpoint.
2. **El endpoint ADOPTA lo que lista, así que su fuente de verdad tiene que ser
   "objetos que existen".** Una fila viva cuyo objeto ya no está (categoría (a) de
   `docs/storage-orphans.md`) se ofrecería para adoptar y crearía un Momento
   apuntando a nada.
3. **El LIST domina en cobertura.** Atrapa el `complete`-sin-momento _y_ el
   PUT-sin-`complete` (que no deja fila). La tabla solo ve el primero.

Además era el siguiente paso ya escrito en `docs/storage-orphans.md`: «Si más
adelante se agrega un `LIST` firmado, basta alimentar esas keys a `presentKeys`».

Coste asumido: firmar un `ListObjectsV2` y parsear su XML sin dependencias nuevas.

## Cambios

| Pieza                                | Qué                                                                                                                                                                                                 |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_lib/r2.ts`                         | `r2ListObjects(prefix, {maxPages})`: `ListObjectsV2` firmado, paginado por `continuation-token`, parseo XML por regex + decodificación de entidades en UNA pasada. Devuelve `{objects, truncated}`. |
| `_lib/momentos-media-mime.ts`        | `isVideoMomentoKey(key)`: mime por extensión (inverso de `EXT_BY_MIME`).                                                                                                                            |
| `momentos-orphaned-blobs.mts` (GET)  | Une las keys de los dos backends. R2 va acotado a `${userId}/` y filtrado por el marcador `r2-`. Suma `scanned` y `partial` a la respuesta.                                                         |
| `momentos-orphaned-blobs.mts` (POST) | Comprueba la existencia en el backend que le toca a la key (HEAD firmado para R2), exige dueño para las keys de R2 y marca `type: 'video'` en el item.                                              |
| `RescueOrphansPanel` / `DataPanel`   | Miniatura `<video>` para las keys de clip; copy que deja de decir solo "fotos".                                                                                                                     |
| `docs/storage-orphans.md`            | La limitación de enumeración ya no es "no hay LIST" sino "el runner todavía no lo usa".                                                                                                             |

### Decisiones finas

- **El prefijo y el marcador no son cosmética.** El bucket R2 es **compartido** con
  la Biblioteca, con el mismo `${userId}/` de prefijo. Sin filtrar por `r2-`, un PDF
  de la Biblioteca aparecería como "foto huérfana" y adoptarlo crearía un Momento
  apuntando a un archivo de otro dominio. Hay test para eso.
- **`scanned.r2: null` cuando R2 no está configurado.** "No miré" y "miré y no había
  nada" no son lo mismo; colapsarlos escondería todos los videos huérfanos detrás de
  un "está todo bien".
- **Un LIST que falla se propaga** (igual que el HEAD de `r2ObjectExists`). Un 403 o
  un 5xx no deben leerse como "bucket vacío": mejor un error visible que una lista
  corta que parece un ok.
- **La comprobación de dueño se añadió solo al camino de R2.** El store de Blobs
  tiene keys legacy sin namespace que el rescate original debe seguir pudiendo
  adoptar; endurecer ese camino es otro trabajo, con su propio riesgo.
- **`type: 'video'` sale de la extensión, no del backend.** El camino multipart
  también acepta clips (≤10 MB), así que un video chico rescatado desde Netlify
  Blobs también se marca.

### Lo que a propósito NO se tocó

- `scripts/check-storage-orphans.mjs` sigue cruzando manifest contra HEADs; ahora
  existe el LIST para cerrar su categoría (b), pero cablearlo es otro pack.
- La regla de lifecycle del bucket documentada en `docs/storage-orphans.md`.
- El listado de Netlify Blobs sigue sin acotar por usuario (comportamiento previo).

## Validación

- **Suite completa**: 5285 tests, 776 archivos — verde.
- **Verificación por mutación** (6 mutantes, todos inyectados y revertidos):

  | Mutante                                             | Esperado   | Resultado |
  | --------------------------------------------------- | ---------- | --------- |
  | M1 barrido de R2 ausente (el bug original)          | cae        | cayó      |
  | M2 sin filtro por marcador `r2-`                    | cae        | cayó      |
  | M3 toda key `r2-` se da por huérfana                | cae        | cayó      |
  | M4 POST comprueba existencia en el store equivocado | cae        | cayó (×2) |
  | M5 POST sin comprobación de dueño para keys de R2   | cae        | cayó      |
  | CONTROL tope de páginas 20 → 19                     | **no** cae | verde     |

  El control confirma que las sondas miden en vez de limitarse a alarmar.

- **Gates**: 26 en verde (storage-boundaries, backend-domain-services, api-error-shape,
  operational-observability, client-api-contracts, user-id-writes, auth-rls-contracts,
  legacy-media-fallbacks, docs-drift, script-registry, mock-completeness, knip,
  design-tokens, focus-ring, frontend-boundaries, structure-ratchets…).
- `typecheck`, `lint`, `format:check`, `build` y `check-bundle-size` en verde.
- **Navegador** (preview demo): la sección "Media huérfana" renderiza con el copy
  nuevo y sin errores de consola propios.

### Lo que NO se pudo verificar en el navegador

La miniatura de video **no** se pudo ejercitar en el preview: `demoRouter` no
implementa `momentos-orphaned-blobs`, así que en modo demo la lista siempre llega
vacía. Esa rama está verificada sobre el DOM real de jsdom (un `<video>`, un `<img>`
y el nombre accesible del botón), no sobre una captura. Queda sin comprobar contra
R2 real: firmar y paginar de verdad exige credenciales que no hay en local.
