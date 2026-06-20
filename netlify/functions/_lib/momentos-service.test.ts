import { describe, expect, it } from 'vitest'
import {
  buildMomentoCreateDraft,
  buildMomentoPatchDraft,
  ownerIdFromMomentoRow,
} from './momentos-service.js'

describe('momentos-service', () => {
  it('resolves owner id from shared response rows with fallback', () => {
    expect(ownerIdFromMomentoRow({ owner_user_id: 'owner-a' }, 'viewer-b')).toBe(
      'owner-a',
    )
    expect(ownerIdFromMomentoRow({}, 'viewer-b')).toBe('viewer-b')
  })

  it('builds a create draft with normalized note, origin, timestamp and entity ids', () => {
    const draft = buildMomentoCreateDraft(
      {
        kind: 'nota',
        payload: { bodyText: 'Una nota' },
        note: '  contexto  ',
        entity_ids: ['e1', 42, 'e2'],
        origin: { kind: 'manual' },
      },
      () => '2026-06-20T01:02:03.000Z',
    )

    expect(draft).toEqual({
      kind: 'nota',
      payload: { bodyText: 'Una nota' },
      note: 'contexto',
      origin: { kind: 'manual' },
      capturedAt: '2026-06-20T01:02:03.000Z',
      entityIds: ['e1', 'e2'],
      embedSource: 'contexto\nUna nota',
    })
  })

  it('builds a patch draft that only re-embeds when text changes', () => {
    const draft = buildMomentoPatchDraft({
      current: {
        kind: 'nota',
        payload: { bodyText: 'Viejo' },
        note: 'nota vieja',
      },
      patch: { captured_at: '2026-06-21T00:00:00.000Z', entity_ids: ['e1'] },
    })

    expect(draft).toEqual({
      kind: 'nota',
      payload: { bodyText: 'Viejo' },
      note: 'nota vieja',
      capturedAt: '2026-06-21T00:00:00.000Z',
      entityIds: ['e1'],
      payloadChanged: false,
      noteChanged: false,
      shouldReembed: false,
      embedSource: '',
    })
  })

  it('validates merged payloads when patching text fields', () => {
    const draft = buildMomentoPatchDraft({
      current: {
        kind: 'nota',
        payload: { bodyText: 'Viejo' },
        note: 'nota vieja',
      },
      patch: { payload: { bodyText: 'Nuevo' }, note: null },
    })

    expect(draft.shouldReembed).toBe(true)
    expect(draft.note).toBeNull()
    expect(draft.embedSource).toBe('Nuevo')
  })
})
