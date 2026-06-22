import { describe, expect, it, beforeEach } from 'vitest'
import { mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'
import { LibraryOverrideValidationError } from './library-overrides'
import {
  isLibraryLinkTargetKind,
  linkLibraryItem,
  listLibraryItemLinks,
  normalizeTargetKey,
  unlinkLibraryItem,
} from './library-links'

const sql = setupMockSql().getSql()

describe('library-links — validación pura', () => {
  it('acepta los 3 target kinds y rechaza el resto', () => {
    for (const k of ['entidad', 'nota', 'momento']) {
      expect(isLibraryLinkTargetKind(k)).toBe(true)
    }
    expect(isLibraryLinkTargetKind('proyecto')).toBe(false)
    expect(isLibraryLinkTargetKind(7)).toBe(false)
  })

  it('normalizeTargetKey recorta el id y valida kind/rango', () => {
    expect(normalizeTargetKey({ targetKind: 'entidad', targetId: '  e1 ' })).toEqual({
      targetKind: 'entidad',
      targetId: 'e1',
    })
    expect(() => normalizeTargetKey({ targetKind: 'bad', targetId: 'x' })).toThrow(
      LibraryOverrideValidationError,
    )
    expect(() => normalizeTargetKey({ targetKind: 'nota', targetId: '' })).toThrow(
      LibraryOverrideValidationError,
    )
    expect(() =>
      normalizeTargetKey({ targetKind: 'nota', targetId: 'x'.repeat(301) }),
    ).toThrow(LibraryOverrideValidationError)
  })
})

describe('library-links — queries (mock SQL)', () => {
  beforeEach(() => mockSqlResponses.reset())

  it('linkLibraryItem upsertea y revive (ON CONFLICT DO UPDATE deleted_at=NULL)', async () => {
    mockSqlResponses.push([{ id: 'lnk-1' }])

    const row = await linkLibraryItem(sql, {
      userId: 'user-a',
      itemKind: 'notas-attachment',
      itemId: 'a1',
      targetKind: 'entidad',
      targetId: 'e1',
    })

    expect(row?.id).toBe('lnk-1')
    const call = mockSqlState.calls.at(-1)
    expect(call?.template).toMatch(/INSERT INTO library_item_links/i)
    expect(call?.template).toMatch(
      /ON CONFLICT \(user_id, item_kind, item_id, target_kind, target_id\)/i,
    )
    expect(call?.template).toMatch(/deleted_at = NULL/i)
    expect(call?.values).toEqual(
      expect.arrayContaining(['user-a', 'notas-attachment', 'a1', 'entidad', 'e1']),
    )
  })

  it('linkLibraryItem rechaza target inválido sin tocar SQL', async () => {
    await expect(
      linkLibraryItem(sql, {
        userId: 'u',
        itemKind: 'notas-attachment',
        itemId: 'a1',
        targetKind: 'bad',
        targetId: 'x',
      }),
    ).rejects.toThrow(LibraryOverrideValidationError)
    expect(mockSqlState.calls).toHaveLength(0)
  })

  it('unlinkLibraryItem hace soft-delete filtrando por user_id', async () => {
    mockSqlResponses.push([])

    await unlinkLibraryItem(sql, {
      userId: 'user-a',
      itemKind: 'pdf-saved',
      itemId: 'p1',
      targetKind: 'nota',
      targetId: 'n1',
    })

    const call = mockSqlState.calls.at(-1)
    expect(call?.template).toMatch(/UPDATE library_item_links/i)
    expect(call?.template).toMatch(/SET deleted_at = NOW\(\)/i)
    expect(call?.values).toEqual(
      expect.arrayContaining(['user-a', 'pdf-saved', 'p1', 'nota', 'n1']),
    )
  })

  it('listLibraryItemLinks une los 3 destinos y filtra vínculos vivos del usuario', async () => {
    mockSqlResponses.push([])

    await listLibraryItemLinks(sql, {
      userId: 'user-a',
      itemKind: 'notas-attachment',
      itemId: 'a1',
    })

    const call = mockSqlState.calls.at(-1)
    const t = call!.template
    expect(t).toMatch(/FROM library_item_links/i)
    expect(t).toMatch(/LEFT JOIN entities/i)
    expect(t).toMatch(/LEFT JOIN notes/i)
    expect(t).toMatch(/LEFT JOIN momentos/i)
    expect(t).toMatch(/l\.deleted_at IS NULL/i)
    expect(call!.values).toEqual(
      expect.arrayContaining(['user-a', 'notas-attachment', 'a1']),
    )
  })
})
