/**
 * Mapa de "color de acento" por tipo de entidad — resolved vía CSS
 * variables para que dark mode pueda shiftearlos sin duplicar lógica
 * en JS.
 *
 * Conocidos → `var(--type-<slug>)` (definidos en `src/index.css` bajo
 * `:root` y `html.dark`). Cualquier slug nuevo cae al default —
 * agregarlo solo requiere agregar la CSS variable, no tocar este
 * archivo (que existe únicamente para no romper el estilo de pares
 * conocidos a la primera carga).
 *
 * Vive en `src/lib/` porque lo usan GraphNode + EntitySigil + MomentoEntry
 * + EntityHeader + GraphMinimap. Antes vivía en `GraphNode.tsx` y los
 * otros lo importaban transitive desde ahí — smell de "logic in
 * component file".
 */

const KNOWN_TYPES = new Set([
  'persona',
  'escritor',
  'filosofo',
  'musico',
  'banda',
  'director',
  'artista',
  'cientifico',
  'libro',
  'ensayo',
  'poema',
  'articulo',
  'cancion',
  'podcast',
  'album',
  'disco',
  'pelicula',
  'serie',
  'documental',
  'obra',
  'concepto',
  'idea',
  'lugar',
  'evento',
])

export function typeAccent(type: string): string {
  return KNOWN_TYPES.has(type) ? `var(--type-${type})` : 'var(--type-default)'
}
