/**
 * Núcleo PURO de clasificación de huérfanos de storage. Sin DB, sin red: recibe
 * (a) las filas relevantes del manifest `storage_assets` y (b) el set de keys que
 * SÍ existen en el store, y reparte cada cosa en tres baldes:
 *
 *   - `manifestWithoutObject`: fila en `storage_assets` cuyo objeto NO está en el
 *     store (p.ej. un `complete` que se registró pero el PUT nunca llegó, o un
 *     borrado parcial que dejó la fila viva). Limpieza: revisar y soft-deletear
 *     la fila por el camino de dominio; nunca con un DELETE crudo.
 *   - `objectsWithoutManifest`: objeto en el store sin fila de manifest (p.ej. un
 *     PUT presignado que nunca llamó a `complete`). Limpieza: la regla de
 *     lifecycle del bucket borra los incompletos tras N días — ver
 *     `docs/storage-orphans.md`.
 *   - `ok`: fila con objeto presente. Estado sano.
 *
 * Por qué pura y separada del runner: la frontera de storage exige lógica de
 * dominio testeable fuera de los handlers/red (ver
 * `docs/conventions/storage-boundaries.md` y
 * `docs/conventions/backend-domain-services.md`). El runner
 * `scripts/check-storage-orphans.mjs` arma `presentKeys` con HEADs firmados a R2
 * y delega TODO el veredicto acá, así esto se testea sin credenciales ni red.
 *
 * Identidad: una fila del manifest se identifica por la terna
 * `provider|domain|storage_key` (el mismo unique de `storage_assets`). El cotejo
 * contra el store es por `storage_key`, que es lo que el store realmente conoce.
 */

/**
 * Subconjunto de columnas de `storage_assets` que la clasificación necesita. El
 * runner SELECTea exactamente esto; el resto de columnas no influye en el
 * veredicto y no se arrastra para no filtrar metadata de más.
 */
export type StorageManifestRow = {
  provider: string
  domain: string
  storageKey: string
}

/** Categoría de cada item del reporte. */
export type StorageOrphanCategory =
  | 'manifest-without-object'
  | 'object-without-manifest'
  | 'ok'

/** Item ya clasificado, con la key sanitizada lista para imprimir. */
export type StorageOrphanItem = {
  provider: string
  domain: string
  /** Key sanitizada (prefijo de owner + hash); nunca la key completa en claro. */
  sanitizedKey: string
  category: StorageOrphanCategory
}

export type StorageOrphanReport = {
  manifestWithoutObject: StorageOrphanItem[]
  objectsWithoutManifest: StorageOrphanItem[]
  ok: StorageOrphanItem[]
  counts: {
    manifestRows: number
    presentKeys: number
    manifestWithoutObject: number
    objectsWithoutManifest: number
    ok: number
  }
}

export type ClassifyStorageOrphansInput = {
  /** Filas del manifest a cotejar (idealmente activas: `deleted_at IS NULL`). */
  manifestRows: StorageManifestRow[]
  /**
   * Set (o lista) de `storage_key` que SÍ existen en el store. El runner lo arma
   * probando existencia objeto por objeto (HEAD firmado en R2). Si el store no se
   * puede listar de forma read-only, solo se pueblan las keys efectivamente
   * comprobadas — ver limitación de netlify-blobs en el runner.
   */
  presentKeys: Iterable<string>
  /**
   * Provider de las `presentKeys`. Solo los objetos de ESE provider se evalúan
   * para `objectsWithoutManifest`; las filas de otros providers nunca se marcan
   * como huérfanas por ausencia en un store que no es el suyo. Si se omite, no se
   * computa `objectsWithoutManifest` (el set de keys es ambiguo respecto al
   * provider) y solo se reporta `manifestWithoutObject` sobre las filas dadas.
   */
  provider?: string
}

/**
 * Hash estable y corto para sanitizar una key sin exponerla. Implementación
 * propia (sin `node:crypto`) para que el núcleo sea importable desde cualquier
 * runtime y 100% determinístico en tests. NO es criptográfico: solo desambigua.
 */
function shortHash(value: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Sanitiza una `storage_key` para logs/reportes: emite el prefijo de owner (lo
 * que va antes del primer `/`, p.ej. el `userId`) más un hash de la key entera.
 * Espeja la intención de `storageKeyForLog()` de `storage-assets.ts`, pero sin
 * `node:crypto` para mantener el núcleo libre de dependencias de runtime.
 */
export function sanitizeStorageKey(storageKey: string): string {
  const slash = storageKey.indexOf('/')
  const ownerPrefix = slash > 0 ? storageKey.slice(0, slash) : '<no-owner>'
  return `${ownerPrefix}/…#${shortHash(storageKey)}`
}

function toItem(
  row: { provider: string; domain: string; storageKey: string },
  category: StorageOrphanCategory,
): StorageOrphanItem {
  return {
    provider: row.provider,
    domain: row.domain,
    sanitizedKey: sanitizeStorageKey(row.storageKey),
    category,
  }
}

function sortItems(items: StorageOrphanItem[]): StorageOrphanItem[] {
  return items.sort(
    (a, b) =>
      a.provider.localeCompare(b.provider) ||
      a.domain.localeCompare(b.domain) ||
      a.sanitizedKey.localeCompare(b.sanitizedKey),
  )
}

/**
 * Clasifica huérfanos de storage de forma PURA.
 *
 * Devuelve `{ manifestWithoutObject, objectsWithoutManifest, ok, counts }`:
 *   - cada fila del manifest cae en `ok` (su `storage_key` está en `presentKeys`)
 *     o en `manifestWithoutObject` (no está);
 *   - cada key presente que NO tiene fila en el manifest cae en
 *     `objectsWithoutManifest` (solo si se pasó `provider`, para no atribuir un
 *     objeto a un provider que no es el suyo).
 *
 * Idempotente y sin efectos: dos llamadas con la misma entrada dan el mismo
 * resultado, y el orden de entrada no altera la salida (se ordena al final).
 */
export function classifyStorageOrphans(
  input: ClassifyStorageOrphansInput,
): StorageOrphanReport {
  const present = new Set(input.presentKeys)
  const manifestKeys = new Set<string>()

  const manifestWithoutObject: StorageOrphanItem[] = []
  const ok: StorageOrphanItem[] = []

  for (const row of input.manifestRows) {
    manifestKeys.add(row.storageKey)
    if (present.has(row.storageKey)) ok.push(toItem(row, 'ok'))
    else manifestWithoutObject.push(toItem(row, 'manifest-without-object'))
  }

  const objectsWithoutManifest: StorageOrphanItem[] = []
  if (input.provider !== undefined) {
    for (const key of present) {
      if (manifestKeys.has(key)) continue
      objectsWithoutManifest.push(
        toItem(
          { provider: input.provider, domain: '<unknown>', storageKey: key },
          'object-without-manifest',
        ),
      )
    }
  }

  sortItems(manifestWithoutObject)
  sortItems(objectsWithoutManifest)
  sortItems(ok)

  return {
    manifestWithoutObject,
    objectsWithoutManifest,
    ok,
    counts: {
      manifestRows: input.manifestRows.length,
      presentKeys: present.size,
      manifestWithoutObject: manifestWithoutObject.length,
      objectsWithoutManifest: objectsWithoutManifest.length,
      ok: ok.length,
    },
  }
}
