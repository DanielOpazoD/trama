import { describe, expect, it, beforeEach } from 'vitest'
import { mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'
import {
  LibraryOverrideValidationError,
  isLibraryItemKind,
  normalizeDisplayTitle,
  normalizeItemKey,
  normalizeTags,
  renameLibraryItem,
  setLibraryItemDeleted,
  setLibraryItemPinned,
  setLibraryItemTags,
} from './library-overrides'

const sql = setupMockSql().getSql()

function overrideRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ov-1',
    item_kind: 'notas-attachment',
    item_id: 'a1',
    display_title: null,
    deleted_at: null,
    updated_at: '2026-06-21T00:00:00.000Z',
    ...overrides,
  }
}

describe('library-overrides — validación pura', () => {
  it('acepta los 6 kinds permitidos y rechaza el resto', () => {
    for (const kind of [
      'library-upload',
      'notas-attachment',
      'recorte-image',
      'momento-foto',
      'pdf-saved',
      'pdf-stamp',
    ]) {
      expect(isLibraryItemKind(kind)).toBe(true)
    }
    expect(isLibraryItemKind('nope')).toBe(false)
    expect(isLibraryItemKind(123)).toBe(false)
  })

  it('normalizeItemKey lanza con kind inválido o id fuera de rango', () => {
    expect(() => normalizeItemKey({ itemKind: 'bad', itemId: 'a' })).toThrow(
      LibraryOverrideValidationError,
    )
    expect(() => normalizeItemKey({ itemKind: 'pdf-saved', itemId: '' })).toThrow(
      LibraryOverrideValidationError,
    )
    expect(() =>
      normalizeItemKey({ itemKind: 'pdf-saved', itemId: 'x'.repeat(301) }),
    ).toThrow(LibraryOverrideValidationError)
    expect(normalizeItemKey({ itemKind: 'pdf-saved', itemId: 'abc' })).toEqual({
      itemKind: 'pdf-saved',
      itemId: 'abc',
    })
  })

  it('normalizeDisplayTitle recorta y exige 1..400 tras trim', () => {
    expect(normalizeDisplayTitle('  Hola  ')).toBe('Hola')
    expect(() => normalizeDisplayTitle('   ')).toThrow(LibraryOverrideValidationError)
    expect(() => normalizeDisplayTitle('')).toThrow(LibraryOverrideValidationError)
    expect(() => normalizeDisplayTitle('x'.repeat(401))).toThrow(
      LibraryOverrideValidationError,
    )
    expect(() => normalizeDisplayTitle(42)).toThrow(LibraryOverrideValidationError)
  })

  it('normalizeTags recorta, descarta vacíos y deduplica sin distinguir mayúsculas', () => {
    expect(normalizeTags(['  Foto ', 'foto', 'PDF', '  ', 'pdf'])).toEqual([
      'Foto',
      'PDF',
    ])
    expect(normalizeTags([])).toEqual([])
  })

  it('normalizeTags rechaza no-arrays, no-strings y excesos de tamaño/cantidad', () => {
    expect(() => normalizeTags('foto')).toThrow(LibraryOverrideValidationError)
    expect(() => normalizeTags([42])).toThrow(LibraryOverrideValidationError)
    expect(() => normalizeTags(['x'.repeat(51)])).toThrow(LibraryOverrideValidationError)
    const tooMany = Array.from({ length: 31 }, (_, i) => `t${i}`)
    expect(() => normalizeTags(tooMany)).toThrow(LibraryOverrideValidationError)
  })
})

describe('library-overrides — upserts (mock SQL)', () => {
  beforeEach(() => mockSqlResponses.reset())

  it('renameLibraryItem upsertea display_title con user_id explícito y ON CONFLICT', async () => {
    mockSqlResponses.push([overrideRow({ display_title: 'Nuevo nombre' })])

    const row = await renameLibraryItem(sql, {
      userId: 'user-a',
      itemKind: 'notas-attachment',
      itemId: 'a1',
      displayTitle: '  Nuevo nombre  ',
    })

    expect(row?.display_title).toBe('Nuevo nombre')
    const call = mockSqlState.calls.at(-1)
    expect(call?.template).toMatch(/INSERT INTO library_item_overrides/i)
    expect(call?.template).toMatch(/user_id, item_kind, item_id, display_title/i)
    expect(call?.template).toMatch(/ON CONFLICT \(user_id, item_kind, item_id\)/i)
    expect(call?.template).toMatch(/display_title = EXCLUDED\.display_title/i)
    // El título viaja trimmeado; user_id va explícito (contrato user-id-writes).
    expect(call?.values).toEqual(
      expect.arrayContaining(['user-a', 'notas-attachment', 'a1', 'Nuevo nombre']),
    )
  })

  it('renameLibraryItem rechaza títulos vacíos sin tocar SQL', async () => {
    await expect(
      renameLibraryItem(sql, {
        userId: 'user-a',
        itemKind: 'notas-attachment',
        itemId: 'a1',
        displayTitle: '   ',
      }),
    ).rejects.toThrow(LibraryOverrideValidationError)
    expect(mockSqlState.calls).toHaveLength(0)
  })

  it('setLibraryItemDeleted=true marca deleted_at (NOW) vía upsert', async () => {
    mockSqlResponses.push([overrideRow({ deleted_at: '2026-06-21T10:00:00.000Z' })])

    const row = await setLibraryItemDeleted(sql, {
      userId: 'user-a',
      itemKind: 'pdf-saved',
      itemId: 'p1',
      deleted: true,
    })

    expect(row?.deleted_at).toBeTruthy()
    const call = mockSqlState.calls.at(-1)
    expect(call?.template).toMatch(/INSERT INTO library_item_overrides/i)
    expect(call?.template).toMatch(/deleted_at = /i)
    // user_id explícito + un timestamp no-nulo entre los valores.
    expect(call?.values).toContain('user-a')
    expect(call?.values.some((v) => typeof v === 'string' && v.includes('T'))).toBe(true)
  })

  it('setLibraryItemDeleted=false restaura (deleted_at NULL)', async () => {
    mockSqlResponses.push([overrideRow({ deleted_at: null })])

    await setLibraryItemDeleted(sql, {
      userId: 'user-a',
      itemKind: 'pdf-saved',
      itemId: 'p1',
      deleted: false,
    })

    const call = mockSqlState.calls.at(-1)
    // El bind del deleted_at es null al restaurar.
    expect(call?.values).toContain(null)
  })

  it('rechaza kind inválido en los upserts', async () => {
    await expect(
      setLibraryItemDeleted(sql, {
        userId: 'user-a',
        itemKind: 'nope',
        itemId: 'p1',
        deleted: true,
      }),
    ).rejects.toThrow(LibraryOverrideValidationError)
  })

  it('setLibraryItemTags upsertea tags normalizados con cast text[] y user_id explícito', async () => {
    mockSqlResponses.push([overrideRow({ tags: ['factura', '2026'] })])

    const row = await setLibraryItemTags(sql, {
      userId: 'user-a',
      itemKind: 'notas-attachment',
      itemId: 'a1',
      tags: ['  factura ', 'factura', '2026'],
    })

    expect(row?.tags).toEqual(['factura', '2026'])
    const call = mockSqlState.calls.at(-1)
    expect(call?.template).toMatch(/INSERT INTO library_item_overrides/i)
    expect(call?.template).toMatch(/tags = EXCLUDED\.tags/i)
    expect(call?.template).toMatch(/::text\[\]/i)
    expect(call?.values).toContain('user-a')
    // Los tags viajan trimmeados + deduplicados como un único bind array.
    expect(call?.values).toContainEqual(['factura', '2026'])
  })

  it('setLibraryItemTags rechaza un tags no-lista sin tocar SQL', async () => {
    await expect(
      setLibraryItemTags(sql, {
        userId: 'user-a',
        itemKind: 'notas-attachment',
        itemId: 'a1',
        tags: 'no-soy-lista',
      }),
    ).rejects.toThrow(LibraryOverrideValidationError)
    expect(mockSqlState.calls).toHaveLength(0)
  })

  it('setLibraryItemPinned upsertea pinned con user_id explícito', async () => {
    mockSqlResponses.push([overrideRow({ pinned: true })])

    const row = await setLibraryItemPinned(sql, {
      userId: 'user-a',
      itemKind: 'pdf-saved',
      itemId: 'p1',
      pinned: true,
    })

    expect(row?.pinned).toBe(true)
    const call = mockSqlState.calls.at(-1)
    expect(call?.template).toMatch(/pinned = EXCLUDED\.pinned/i)
    expect(call?.values).toEqual(
      expect.arrayContaining(['user-a', 'pdf-saved', 'p1', true]),
    )
  })

  it('setLibraryItemPinned rechaza pinned no booleano sin tocar SQL', async () => {
    await expect(
      setLibraryItemPinned(sql, {
        userId: 'user-a',
        itemKind: 'pdf-saved',
        itemId: 'p1',
        pinned: 'sí' as unknown as boolean,
      }),
    ).rejects.toThrow(LibraryOverrideValidationError)
    expect(mockSqlState.calls).toHaveLength(0)
  })
})
