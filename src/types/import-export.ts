import type { Entity } from './entity'
import type { Relationship } from './relationship'
import type { Quote } from './quote'

/**
 * Payload del export completo. v1 incluye entities + relationships + quotes.
 * Momentos NO están incluidos (todavía) — agregarlos requeriría también
 * los blobs binarios y eso es scope distinto.
 */
export type ExportPayload = {
  version: 1
  exportedAt: string
  entities: Entity[]
  relationships: Relationship[]
  quotes: Quote[]
}

/**
 * Resultado de POST /api/import. Antes era `{ imported: number }`; ahora el
 * endpoint reporta también filas saltadas (validación o duplicados) y filas
 * que reventaron al insertar. Permite distinguir "se importaron 140 de 150"
 * entre "10 inválidos" vs "10 reventados".
 */
export type ImportFailedItem = {
  kind: 'entity' | 'relationship' | 'quote'
  id: string | null
  reason: string
}

export type ImportResult = {
  imported: number
  skipped?: number
  failed?: ImportFailedItem[]
}
