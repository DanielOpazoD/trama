import { describe, expect, test } from 'vitest'
import {
  buildMomentosListResponse,
  groupMomentoEntityLinks,
  parseMomentosListParams,
  type MomentoListRow,
} from './momentos-list'

function row(id: string, capturedAt: string): MomentoListRow {
  return {
    id,
    kind: 'nota',
    captured_at: capturedAt,
    payload: { bodyText: id },
    note: null,
    origin: { kind: 'manual' },
    created_at: capturedAt,
    updated_at: capturedAt,
  }
}

describe('momentos-list helpers', () => {
  test('parseMomentosListParams normaliza limit, kind y cursor', () => {
    expect(
      parseMomentosListParams(
        new URL(
          'http://localhost/api/momentos?limit=999&kind=foto&cursor=2026-05-24T12:00:00.000Z:m1',
        ),
      ),
    ).toEqual({
      limit: 200,
      validKind: 'foto',
      cursorTs: '2026-05-24T12:00:00.000Z',
      cursorId: 'm1',
    })

    expect(
      parseMomentosListParams(
        new URL('http://localhost/api/momentos?limit=nope&kind=otro&cursor=mal'),
      ),
    ).toEqual({
      limit: 50,
      validKind: null,
      cursorTs: null,
      cursorId: null,
    })
  })

  test('groupMomentoEntityLinks agrupa vínculos por momento', () => {
    expect(
      groupMomentoEntityLinks([
        { momento_id: 'm1', entity_id: 'e1' },
        { momento_id: 'm1', entity_id: 'e2' },
        { momento_id: 'm2', entity_id: 'e3' },
      ]),
    ).toEqual(
      new Map([
        ['m1', ['e1', 'e2']],
        ['m2', ['e3']],
      ]),
    )
  })

  test('buildMomentosListResponse calcula nextCursor y adjunta entity_ids', () => {
    const response = buildMomentosListResponse({
      rows: [row('m1', '2026-05-24T12:00:00Z'), row('m2', '2026-05-23T12:00:00Z')],
      limit: 1,
      linksByMomento: new Map([['m1', ['e1']]]),
    })

    expect(response).toEqual({
      items: [{ ...row('m1', '2026-05-24T12:00:00Z'), entity_ids: ['e1'] }],
      nextCursor: '2026-05-24T12:00:00.000Z:m1',
    })
  })
})
