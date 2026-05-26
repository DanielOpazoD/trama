/**
 * Origin (provenance) — quién creó esta fila, y cómo.
 *
 * Es un JSONB en SQL, no string. Si ves comparaciones tipo
 * `entity.origin === 'ai'`, es código viejo: corregir a
 * `entity.origin.kind === 'ai'`.
 */

export type OriginKind = 'manual' | 'ai' | 'imported'

export type Origin = {
  kind: OriginKind
  /** e.g. 'deepseek', 'openai' — solo para kind='ai'. */
  provider?: string
  /** e.g. 'deepseek-chat' — solo para kind='ai'. */
  model?: string
  /** Ref a la fila de extraction_log que produjo este registro. */
  extractionLogId?: string
  /** e.g. 'json-export', 'obsidian' — solo para kind='imported'. */
  importedFrom?: string
}

export const MANUAL_ORIGIN: Origin = { kind: 'manual' }
