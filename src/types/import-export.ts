import type { Entity } from './entity'
import type { Momento } from './momento'
import type { Origin } from './origin'
import type { Relationship } from './relationship'
import type { Quote } from './quote'

/**
 * Payload de export/import.
 *
 * v1 fue el contrato parcial legado: entities + relationships + quotes.
 * v2 es el backup estructurado core: agrega Momentos, notas, tareas y las
 * referencias a blobs de media. Los bytes binarios de Netlify Blobs quedan
 * fuera deliberadamente; `blobReferences` permite auditar qué media depende
 * del storage.
 */
export type ExportScope = {
  kind: 'legacy-partial' | 'structured-core'
  label?: string
  includes: string[]
  excludes: string[]
}

export type ExportNote = {
  id: string
  content: string
  tags: string[]
  pinned: boolean
  promotedMomentoId?: string | null
  origin?: Origin
  createdAt: string
  updatedAt: string
}

export type ExportTask = {
  id: string
  title: string
  detail?: string | null
  done: boolean
  dueDate?: string | null
  completedAt?: string | null
  tags: string[]
  origin?: Origin
  createdAt: string
  updatedAt: string
}

export type ExportPayload = {
  version: 1 | 2
  scope?: ExportScope
  exportedAt: string
  entities: Entity[]
  relationships: Relationship[]
  quotes: Quote[]
  momentos?: Momento[]
  notes?: ExportNote[]
  tasks?: ExportTask[]
  blobReferences?: string[]
}

/**
 * Resultado de POST /api/import. Antes era `{ imported: number }`; ahora el
 * endpoint reporta también filas saltadas (validación o duplicados) y filas
 * que reventaron al insertar. Permite distinguir "se importaron 140 de 150"
 * entre "10 inválidos" vs "10 reventados".
 */
export type ImportFailedItem = {
  kind:
    | 'entity'
    | 'relationship'
    | 'quote'
    | 'momento'
    | 'momento_entity'
    | 'note'
    | 'task'
  id: string | null
  reason: string
}

export type ImportResult = {
  imported: number
  skipped?: number
  failed?: ImportFailedItem[]
}
