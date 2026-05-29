/**
 * Resolución de ids para POST /api/import.
 *
 * Las columnas `id` / `entity_id` / `from_id` / `to_id` son UUID en Postgres.
 * Un export nativo de Trama ya trae UUIDs, pero un JSON armado a mano (o por
 * otra IA con el prompt de "Copiar prompt" de Citas) usa slugs legibles tipo
 * "laotse" / "laotse-1". Insertar esos slugs en una columna UUID revienta con
 * `invalid input syntax for type uuid`.
 *
 * `resolveImportId` traduce cualquier id entrante al UUID real a insertar:
 *   - Si ya es un UUID → se usa tal cual (round-trip de exports nativos,
 *     idempotente vía ON CONFLICT (id) DO NOTHING).
 *   - Si es un slug u otro string → UUID v5 (SHA-1) determinista, namespaceado
 *     por `userId`. Determinista ⇒ el mismo slug del mismo usuario siempre da
 *     el mismo UUID ⇒ reimportar el mismo archivo no duplica. Namespaceado por
 *     usuario ⇒ el "laotse" de dos usuarios distintos NO colisiona (cada uno
 *     obtiene su propia entidad), clave para el modelo multi-user.
 *
 * Como `resolveImportId` es determinista por (userId, rawId), una cita que
 * referencia a su autor por slug (`entityId: "laotse"`) resuelve al MISMO UUID
 * que la entidad `id: "laotse"` — el enlace se preserva sin necesidad de un
 * mapa compartido entre los loops del handler.
 */
import { createHash } from 'node:crypto'

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/** Namespace fijo para derivar UUIDs deterministas de ids no-UUID en imports. */
const IMPORT_NAMESPACE = 'b9d3e2a1-7c4f-4e8a-9b2d-1f6c3a5e0d77'

export function isUuid(s: string): boolean {
  return UUID_RE.test(s)
}

/** UUID v5 (RFC 4122, basado en SHA-1) de `name` bajo `namespace`. */
function uuidV5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex')
  const hash = createHash('sha1').update(ns).update(Buffer.from(name, 'utf8')).digest()
  const b = hash.subarray(0, 16)
  b[6] = (b[6]! & 0x0f) | 0x50 // versión 5
  b[8] = (b[8]! & 0x3f) | 0x80 // variante RFC 4122
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/**
 * Resuelve el id entrante de un import al UUID a insertar.
 * @param rawId  id tal como viene en el JSON (UUID o slug)
 * @param userId dueño del import — namespacea los slugs por usuario
 */
export function resolveImportId(rawId: string, userId: string): string {
  if (isUuid(rawId)) return rawId.toLowerCase()
  // "::" como separador (no aparece en un userId Clerk ni en un slug normal):
  // evita que el par ("ab","c") colisione con ("a","bc") al concatenar.
  return uuidV5(`${userId}::${rawId}`, IMPORT_NAMESPACE)
}
