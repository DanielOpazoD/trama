import type { Origin } from './origin'

/**
 * Entity — el nodo principal del grafo. Una persona, libro, canción, idea,
 * lugar, evento, etc.
 *
 * `type` es `string` deliberadamente: la fuente de verdad vive en la tabla
 * `entity_types` en Postgres. Agregar un tipo nuevo es una migración SQL,
 * no un cambio de código. `ENTITY_TYPES` abajo es fallback para selects
 * manuales — mantener en sync con las seed migrations.
 */
export type EntityType = string

export const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'persona', label: 'persona' },
  { value: 'escritor', label: 'escritor' },
  { value: 'filosofo', label: 'filósofo' },
  { value: 'musico', label: 'músico' },
  { value: 'banda', label: 'banda / grupo' },
  { value: 'director', label: 'director' },
  { value: 'artista', label: 'artista' },
  { value: 'cientifico', label: 'científico' },
  { value: 'libro', label: 'libro' },
  { value: 'ensayo', label: 'ensayo' },
  { value: 'poema', label: 'poema' },
  { value: 'articulo', label: 'artículo' },
  { value: 'cancion', label: 'canción' },
  { value: 'podcast', label: 'podcast' },
  { value: 'album', label: 'álbum' },
  { value: 'disco', label: 'disco' },
  { value: 'pelicula', label: 'película' },
  { value: 'serie', label: 'serie' },
  { value: 'documental', label: 'documental' },
  { value: 'obra', label: 'obra' },
  { value: 'concepto', label: 'concepto' },
  { value: 'idea', label: 'idea' },
  { value: 'lugar', label: 'lugar' },
  { value: 'evento', label: 'evento' },
]

export type Entity = {
  id: string
  type: EntityType
  name: string
  year?: number
  /** One-liner. Convención: max ~15 palabras, escrito como label de la entidad. */
  description?: string
  positionX?: number
  positionY?: number
  origin: Origin
  /** Spotify URL — populated para entidades musicales (banda, musico, cancion, album, disco). */
  spotifyUrl?: string
  /** Wikipedia URL — opcional, para cualquier tipo. Hipervínculo de referencia. */
  wikipediaUrl?: string
  /** Grokipedia URL — entrada automática en Grokipedia (grokipedia.com). */
  grokipediaUrl?: string
  createdAt: string
  updatedAt: string
}
