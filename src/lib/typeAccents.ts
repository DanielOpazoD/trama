/**
 * "Color de acento" por tipo de entidad — resolved vía CSS variables
 * con fallback nativo.
 *
 * S1: antes había un `Set<KNOWN_TYPES>` hardcoded con 24 slugs y la
 * función elegía entre `var(--type-<slug>)` y `var(--type-default)`.
 * Eso contradice la regla de `CLAUDE.md`:
 *
 *   > "`EntityType` es `string`, no unions cerradas. La fuente de
 *   > verdad son las tablas `entity_types`."
 *
 * Agregar un tipo nuevo en DB requería tocar este archivo Y la CSS
 * variable. Smell.
 *
 * Ahora usamos la sintaxis nativa de CSS variables con fallback:
 * `var(--type-<slug>, var(--type-default))`. Si `--type-<slug>`
 * existe en `:root` / `html.dark`, se usa; sino el browser cae al
 * `--type-default` automáticamente — sin que TS ni JS necesiten
 * conocer la lista.
 *
 * Agregar un tipo nuevo desde la app (Admin → tipos) ahora funciona
 * out-of-the-box: el nodo se pinta con el accent default hasta que
 * (opcionalmente) alguien agregue un override en `src/index.css`.
 */

export function typeAccent(type: string): string {
  // Sanitización mínima: solo permitimos chars slug-safe en el nombre
  // de la variable (a-z, 0-9, hyphen, underscore). Sin esto un type
  // malicioso del tipo "x); foo:expression(...)" podría romper el CSS.
  // Los slugs de entity_types ya pasan por validación en la migration
  // (snake_case-ish), pero esto es defense-in-depth para imports
  // legacy o data inconsistente.
  const safe = type.replace(/[^a-z0-9_-]/gi, '')
  if (!safe) return 'var(--type-default)'
  return `var(--type-${safe}, var(--type-default))`
}
