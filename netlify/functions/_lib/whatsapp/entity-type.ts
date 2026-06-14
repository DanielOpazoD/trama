/**
 * Normaliza un tipo de entidad a slug canónico: minúsculas, sin tildes,
 * espacios → `_`, sin otros símbolos. Vacío → `concepto`.
 *
 * Lo comparten el parser de prefijos (`parse-command`) y el clasificador IA
 * (`interpret`) para que AMBOS caminos persistan `entities.type` con la misma
 * forma — si no, la misma entidad entraría como `Libro` por un lado y `libro`
 * por el otro.
 */
export function slugifyEntityType(raw: string | null | undefined): string {
  const s = (raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
  return s || 'concepto'
}
