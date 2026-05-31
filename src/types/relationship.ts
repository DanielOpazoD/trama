import type { Origin } from './origin'

/**
 * Relationship — arista del grafo, conecta dos entidades con un tipo.
 *
 * Como `EntityType`, `RelationshipType` es `string`: la fuente de verdad
 * vive en `relationship_types` en Postgres. RELATIONSHIP_TYPES es fallback
 * para selects manuales.
 */
export type RelationshipType = string

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

export type Relationship = {
  id: string
  fromId: string
  fromName?: string
  toId: string
  toName?: string
  type: RelationshipType
  notes?: string
  origin: Origin
  createdAt: string
  updatedAt: string
}
