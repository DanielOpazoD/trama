import { momentoEmbedText, type MomentoKind } from './momento-embed.js'
import { type MomentoCreateBodyT, type MomentoPatchBodyT } from './momento-schemas.js'
import { normalizeOrigin, type Origin } from './origin.js'

type MomentoResponseLike = Record<string, unknown>

export type MomentoDraftCurrent = {
  kind: MomentoKind
  payload: Record<string, unknown>
  note: string | null
}

export function ownerIdFromMomentoRow(
  row: MomentoResponseLike | undefined,
  fallback: string,
): string {
  return typeof row?.owner_user_id === 'string' ? row.owner_user_id : fallback
}

function normalizeNote(value: string | null | undefined): string | null {
  return typeof value === 'string' ? value.trim() || null : null
}

function stringEntityIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function buildMomentoCreateDraft(
  body: MomentoCreateBodyT,
  now: () => string = () => new Date().toISOString(),
): {
  kind: MomentoKind
  payload: Record<string, unknown>
  note: string | null
  origin: Origin
  capturedAt: string
  entityIds: string[]
  embedSource: string
} {
  const note = normalizeNote(body.note)
  const capturedAt =
    typeof body.captured_at === 'string' && body.captured_at ? body.captured_at : now()

  return {
    kind: body.kind,
    payload: body.payload,
    note,
    origin: normalizeOrigin(body.origin),
    capturedAt,
    entityIds: stringEntityIds(body.entity_ids),
    embedSource: momentoEmbedText(body.kind, body.payload, note),
  }
}

export function buildMomentoPatchDraft(params: {
  current: MomentoDraftCurrent
  patch: MomentoPatchBodyT
}): {
  kind: MomentoKind
  payload: Record<string, unknown>
  note: string | null
  capturedAt: string | null
  entityIds: string[] | null
  payloadChanged: boolean
  noteChanged: boolean
  shouldReembed: boolean
  embedSource: string
} {
  const { current, patch } = params
  const payloadChanged = patch.payload !== undefined
  const noteChanged = patch.note !== undefined
  const payload = payloadChanged
    ? (patch.payload as Record<string, unknown>)
    : current.payload
  const note =
    patch.note === null
      ? null
      : typeof patch.note === 'string'
        ? patch.note.trim() || null
        : current.note
  const capturedAt =
    typeof patch.captured_at === 'string' && patch.captured_at ? patch.captured_at : null
  const shouldReembed = payloadChanged || noteChanged

  return {
    kind: current.kind,
    payload,
    note,
    capturedAt,
    entityIds: Array.isArray(patch.entity_ids) ? stringEntityIds(patch.entity_ids) : null,
    payloadChanged,
    noteChanged,
    shouldReembed,
    embedSource: shouldReembed ? momentoEmbedText(current.kind, payload, note) : '',
  }
}
