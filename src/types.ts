export type EntityType =
  | 'persona'
  | 'libro'
  | 'cancion'
  | 'album'
  | 'pelicula'
  | 'obra'
  | 'concepto'
  | 'idea'

export type Entity = {
  id: string
  type: EntityType
  name: string
  year?: number
  description?: string
  createdAt: string
}

export const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'persona', label: 'persona' },
  { value: 'libro', label: 'libro' },
  { value: 'cancion', label: 'canción' },
  { value: 'album', label: 'álbum' },
  { value: 'pelicula', label: 'película' },
  { value: 'obra', label: 'obra' },
  { value: 'concepto', label: 'concepto' },
  { value: 'idea', label: 'idea' },
]

export type RelationshipType =
  | 'influye_en'
  | 'cita_a'
  | 'responde_a'
  | 'me_llego_por'
  | 'suena_como'
  | 'inspira'
  | 'contradice'
  | 'asociado_con'

export type Relationship = {
  id: string
  fromId: string
  toId: string
  type: RelationshipType
  notes?: string
  createdAt: string
}

export const RELATIONSHIP_TYPES: {
  value: RelationshipType
  label: string
  reverseLabel: string
}[] = [
  { value: 'influye_en', label: 'influye en', reverseLabel: 'influido por' },
  { value: 'cita_a', label: 'cita a', reverseLabel: 'citado por' },
  { value: 'responde_a', label: 'responde a', reverseLabel: 'respondido por' },
  { value: 'me_llego_por', label: 'me llegó por', reverseLabel: 'me llevó a' },
  { value: 'suena_como', label: 'suena como', reverseLabel: 'suena como' },
  { value: 'inspira', label: 'inspira', reverseLabel: 'inspirado por' },
  { value: 'contradice', label: 'contradice', reverseLabel: 'contradicho por' },
  { value: 'asociado_con', label: 'asociado con', reverseLabel: 'asociado con' },
]

export type Quote = {
  id: string
  entityId: string
  text: string
  source?: string
  context?: string
  createdAt: string
}
