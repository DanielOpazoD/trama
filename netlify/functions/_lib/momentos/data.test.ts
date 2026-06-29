import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockSqlResponses, setupMockSql } from '../test-utils'
import { buildMomentoRow } from '../test-fixtures'

vi.mock('../db.js', () => setupMockSql())
const embeddingMocks = vi.hoisted(() => ({
  embedSafe: vi.fn(),
  toPgVector: vi.fn((vector: number[]) => `[${vector.join(',')}]`),
}))
vi.mock('../embeddings.js', () => embeddingMocks)

import { getSql } from '../db.js'
import {
  insertMomentoWithLinks,
  listMomentosPage,
  loadCurrentMomento,
  loadMomentoAfterPatch,
  loadMomentoById,
  loadMomentoEntityLinkIds,
  loadMomentoEntityLinkIdsAfterPatch,
  loadMomentosEntityLinks,
  replaceMomentoEntityLinks,
  selectOwnedEntityIds,
  softDeleteMomento,
  updateMomentoContent,
} from './data.js'

beforeEach(() => {
  mockSqlResponses.reset()
  embeddingMocks.toPgVector.mockClear()
})

const lastTemplate = () => mockSqlResponses.calls[0]?.template ?? ''

describe('data: GET uno', () => {
  it('loadMomentoById consulta momentos con join de acceso y parsea la fila', async () => {
    mockSqlResponses.push([
      buildMomentoRow({
        id: 'm1',
        kind: 'nota',
        captured_at: '2026-05-24T12:00:00Z',
        payload: {},
      }),
    ])
    const rows = await loadMomentoById(getSql(), 'm1', 'u1')
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('m1')
    const q = lastTemplate()
    expect(q).toMatch(/FROM momentos m/i)
    expect(q).toMatch(/LEFT JOIN momento_space_access/i)
    expect(q).toMatch(/WHERE m\.id = \?/i)
  })

  it('loadMomentoEntityLinkIds excluye entidades soft-borradas (JOIN entities deleted_at)', async () => {
    mockSqlResponses.push([{ entity_id: 'e1' }])
    const rows = await loadMomentoEntityLinkIds(getSql(), 'm1', 'owner1')
    expect(rows.map((r) => r.entity_id)).toEqual(['e1'])
    expect(lastTemplate()).toMatch(
      /JOIN entities e ON e\.id = me\.entity_id AND e\.deleted_at IS NULL/i,
    )
  })
})

describe('data: GET lista — listMomentosPage elige template por cursor/kind', () => {
  const base = { limit: 20, validKind: null, cursorTs: null, cursorId: null } as const

  it('sin cursor ni kind → variante "all"', async () => {
    mockSqlResponses.push([])
    await listMomentosPage(getSql(), 'u1', base)
    const q = lastTemplate()
    expect(q).not.toMatch(/m\.kind = \?/i)
    expect(q).not.toMatch(/m\.captured_at, m\.id\) </i)
  })

  it('con kind → filtra por kind', async () => {
    mockSqlResponses.push([])
    await listMomentosPage(getSql(), 'u1', { ...base, validKind: 'nota' })
    expect(lastTemplate()).toMatch(/m\.kind = \?/i)
  })

  it('con cursor → compara la tupla (captured_at, id)', async () => {
    mockSqlResponses.push([])
    await listMomentosPage(getSql(), 'u1', {
      ...base,
      cursorTs: '2026-05-01T00:00:00Z',
      cursorId: 'id1',
    })
    expect(lastTemplate()).toMatch(
      /\(m\.captured_at, m\.id\) < \(\?::timestamptz, \?::uuid\)/i,
    )
  })

  it('con cursor + kind → combina ambos filtros', async () => {
    mockSqlResponses.push([])
    await listMomentosPage(getSql(), 'u1', {
      limit: 5,
      validKind: 'foto',
      cursorTs: 't',
      cursorId: 'i',
    })
    const q = lastTemplate()
    expect(q).toMatch(/m\.kind = \?/i)
    expect(q).toMatch(/\(m\.captured_at, m\.id\) </i)
  })

  it('loadMomentosEntityLinks hace bulk fetch con JOIN entities', async () => {
    mockSqlResponses.push([{ momento_id: 'm1', entity_id: 'e1' }])
    const rows = await loadMomentosEntityLinks(getSql(), ['m1'])
    expect(rows).toHaveLength(1)
    const q = lastTemplate()
    expect(q).toMatch(/me\.momento_id = ANY\(\?::uuid\[\]\)/i)
    expect(q).toMatch(
      /JOIN entities e ON e\.id = me\.entity_id AND e\.deleted_at IS NULL/i,
    )
  })
})

describe('data: entidades / links', () => {
  it('selectOwnedEntityIds consulta entities por pertenencia, sin soft-borradas', async () => {
    mockSqlResponses.push([{ id: 'e1' }])
    const rows = await selectOwnedEntityIds(getSql(), ['e1'], 'u1')
    expect(rows).toEqual([{ id: 'e1' }])
    const q = lastTemplate()
    expect(q).toMatch(/FROM entities/i)
    expect(q).toMatch(/id = ANY\(\?::uuid\[\]\)/i)
    expect(q).toMatch(/deleted_at IS NULL/i)
  })

  it('replaceMomentoEntityLinks con lista vacía soft-deletea todos en un CTE', async () => {
    mockSqlResponses.push([]) // un solo CTE (soft-delete; desired vacío no inserta filas)
    await replaceMomentoEntityLinks(getSql(), 'm1', [], 'owner1')
    expect(mockSqlResponses.calls).toHaveLength(1)
    expect(mockSqlResponses.calls[0].template).toMatch(
      /UPDATE momento_entities\s+SET deleted_at = NOW\(\)/i,
    )
  })

  it('replaceMomentoEntityLinks con ids soft-deletea y reinserta en un CTE atómico', async () => {
    mockSqlResponses.push([]) // un solo CTE: soft-delete + upsert en el mismo statement
    await replaceMomentoEntityLinks(getSql(), 'm1', ['e1', 'e2'], 'owner1')
    expect(mockSqlResponses.calls).toHaveLength(1)
    const tpl = mockSqlResponses.calls[0].template
    expect(tpl).toMatch(/UPDATE momento_entities\s+SET deleted_at = NOW\(\)/i)
    expect(tpl).toMatch(/INSERT INTO momento_entities/i)
    // conjuntos disjuntos: el soft-delete excluye los deseados (sin doble-touch).
    expect(tpl).toMatch(/NOT IN \(SELECT e_id FROM desired\)/i)
  })
})

describe('data: POST create', () => {
  const draft = {
    kind: 'nota' as const,
    capturedAt: '2026-05-24T12:00:00Z',
    payload: { bodyText: 'x' },
    note: null,
    origin: { kind: 'manual' },
    entityIds: [],
  }

  it('insertMomentoWithLinks crea momento + links en un CTE; sin emb no formatea vector', async () => {
    mockSqlResponses.push([{ id: 'new1', kind: 'nota' }])
    const rows = await insertMomentoWithLinks(getSql(), draft, null, 'u1')
    expect(rows[0].id).toBe('new1')
    const q = lastTemplate()
    expect(q).toMatch(/WITH ins AS/i)
    expect(q).toMatch(/INSERT INTO momentos/i)
    expect(q).toMatch(/INSERT INTO momento_entities/i)
    expect(embeddingMocks.toPgVector).not.toHaveBeenCalled()
  })

  it('insertMomentoWithLinks formatea el vector cuando hay embedding', async () => {
    mockSqlResponses.push([{ id: 'new2' }])
    await insertMomentoWithLinks(
      getSql(),
      draft,
      { vector: [0.1, 0.2], model: 'test-model' },
      'u1',
    )
    expect(embeddingMocks.toPgVector).toHaveBeenCalledWith([0.1, 0.2])
  })
})

describe('data: PATCH update', () => {
  it('loadCurrentMomento trae kind/payload/note/rol del momento', async () => {
    mockSqlResponses.push([
      { kind: 'nota', payload: {}, note: null, user_id: 'o1', access_role: 'owner' },
    ])
    const rows = await loadCurrentMomento(getSql(), 'm1', 'u1')
    expect(rows[0].access_role).toBe('owner')
    expect(lastTemplate()).toMatch(/SELECT m\.kind, m\.payload, m\.note, m\.user_id/i)
  })

  it('updateMomentoContent emite UPDATE con CASE de embedding condicional', async () => {
    mockSqlResponses.push([])
    await updateMomentoContent(getSql(), {
      id: 'm1',
      ownerUserId: 'o1',
      newPayload: {},
      newNote: null,
      newCapturedAt: null,
      shouldUpdateContent: true,
      shouldReembed: false,
      emb: null,
    })
    const q = lastTemplate()
    expect(q).toMatch(/UPDATE momentos/i)
    expect(q).toMatch(/SET payload = CASE/i)
    expect(q).toMatch(/embedding = CASE/i)
    expect(q).toMatch(/WHERE id = \? AND deleted_at IS NULL AND user_id = \?/i)
  })

  it('loadMomentoAfterPatch selecciona el momento por id (post-update)', async () => {
    mockSqlResponses.push([
      buildMomentoRow({
        id: 'm1',
        kind: 'nota',
        captured_at: '2026-05-24T12:00:00Z',
        payload: {},
      }),
    ])
    const rows = await loadMomentoAfterPatch(getSql(), 'm1', 'u1')
    expect(rows[0].id).toBe('m1')
    expect(lastTemplate()).toMatch(/WHERE m\.id = \?/i)
  })

  it('loadMomentoEntityLinkIdsAfterPatch lee links SIN el JOIN a entities (comportamiento vigente)', async () => {
    mockSqlResponses.push([{ entity_id: 'e1' }])
    const rows = await loadMomentoEntityLinkIdsAfterPatch(getSql(), 'm1', 'o1')
    expect(rows.map((r) => r.entity_id)).toEqual(['e1'])
    const q = lastTemplate()
    expect(q).toMatch(/FROM momento_entities/i)
    // NB: a diferencia del GET, esta no JOINea entities → no excluye soft-borradas.
    // Deuda conocida; este test la documenta para que un fix sea deliberado.
    expect(q).not.toMatch(/JOIN entities/i)
  })
})

describe('data: DELETE', () => {
  it('softDeleteMomento marca deleted_at y devuelve la fila', async () => {
    mockSqlResponses.push([{ id: 'm1', deleted_at: '2026-05-24T13:00:00Z' }])
    const rows = await softDeleteMomento(getSql(), 'm1', 'u1')
    expect(rows[0].deleted_at).toBe('2026-05-24T13:00:00Z')
    const q = lastTemplate()
    expect(q).toMatch(/UPDATE momentos\s+SET deleted_at = NOW\(\)/i)
    expect(q).toMatch(/RETURNING id, deleted_at/i)
  })
})
