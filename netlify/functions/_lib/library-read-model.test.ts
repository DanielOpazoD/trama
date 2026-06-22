import { describe, expect, test } from 'vitest'
import { mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'
import {
  BibliotecaListQuery,
  buildLibraryListParams,
  fetchLibraryRows,
  parseCursorOffset,
  sortAndPaginate,
  type LibraryItemRow,
} from './library-read-model'

function row(overrides: Partial<LibraryItemRow> = {}): LibraryItemRow {
  return {
    item_kind: 'notas-attachment',
    item_id: 'a1',
    title: 'archivo',
    mime_type: 'text/plain',
    byte_size: 10,
    file_type: 'document',
    source: 'subido',
    storage_key: 'legacy-single-user/a1.txt',
    storage_domain: 'notas-attachments',
    tags: [],
    pinned: false,
    ai_status: null,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('BibliotecaListQuery', () => {
  test('aplica defaults cuando no llegan params', () => {
    expect(BibliotecaListQuery.parse({})).toEqual({
      q: '',
      tab: 'todo',
      tipo: '',
      fuente: '',
      tag: '',
      orden: 'modificado-desc',
      incluyeEliminados: false,
      limit: 30,
      cursor: '',
    })
  })

  test('clampa limit, trimea q y degrada enums desconocidos sin romper', () => {
    expect(
      BibliotecaListQuery.parse({
        q: '  foto ',
        tab: 'otra',
        tipo: 'no-existe',
        fuente: 'no-existe',
        orden: 'inventado',
        incluyeEliminados: 'true',
        limit: '999',
        cursor: ' 30 ',
      }),
    ).toEqual({
      q: 'foto',
      tab: 'todo',
      tipo: '',
      fuente: '',
      tag: '',
      orden: 'modificado-desc',
      incluyeEliminados: true,
      limit: 100,
      cursor: '30',
    })
  })

  test('respeta valores válidos de tab/tipo/fuente/orden', () => {
    expect(
      BibliotecaListQuery.parse({
        tab: 'imagenes',
        tipo: 'image',
        fuente: 'whatsapp',
        orden: 'tamano-asc',
      }),
    ).toMatchObject({
      tab: 'imagenes',
      tipo: 'image',
      fuente: 'whatsapp',
      orden: 'tamano-asc',
    })
  })

  test('acepta el orden por creado (asc/desc)', () => {
    expect(BibliotecaListQuery.parse({ orden: 'creado-desc' }).orden).toBe('creado-desc')
    expect(BibliotecaListQuery.parse({ orden: 'creado-asc' }).orden).toBe('creado-asc')
  })
})

describe('parseCursorOffset', () => {
  test('decodifica offset numérico y degrada valores inválidos a 0', () => {
    expect(parseCursorOffset('60')).toBe(60)
    expect(parseCursorOffset('')).toBe(0)
    expect(parseCursorOffset('abc')).toBe(0)
    expect(parseCursorOffset('-5')).toBe(0)
  })
})

describe('buildLibraryListParams', () => {
  test('separa filtros de SQL y params de paginación', () => {
    const parsed = BibliotecaListQuery.parse({
      q: 'mar',
      tab: 'archivos',
      tipo: 'pdf',
      fuente: 'generado',
      orden: 'nombre-asc',
      incluyeEliminados: 'true',
      limit: '15',
      cursor: '45',
    })
    expect(buildLibraryListParams(parsed)).toEqual({
      fetch: {
        q: 'mar',
        tab: 'archivos',
        tipo: 'pdf',
        fuente: 'generado',
        tag: '',
        incluyeEliminados: true,
      },
      page: { orden: 'nombre-asc', limit: 15, offset: 45 },
    })
  })
})

describe('sortAndPaginate', () => {
  test('ordena por modificado desc por defecto y calcula nextCursor', () => {
    const rows = [
      row({ item_id: 'a', updated_at: '2026-06-01T00:00:00.000Z' }),
      row({ item_id: 'b', updated_at: '2026-06-03T00:00:00.000Z' }),
      row({ item_id: 'c', updated_at: '2026-06-02T00:00:00.000Z' }),
    ]
    const result = sortAndPaginate(rows, {
      orden: 'modificado-desc',
      limit: 2,
      offset: 0,
    })
    expect(result.items.map((r) => r.item_id)).toEqual(['b', 'c'])
    expect(result.nextCursor).toBe('2')
  })

  test('última página devuelve nextCursor null', () => {
    const rows = [row({ item_id: 'a' }), row({ item_id: 'b' })]
    const result = sortAndPaginate(rows, {
      orden: 'modificado-desc',
      limit: 2,
      offset: 0,
    })
    expect(result.items).toHaveLength(2)
    expect(result.nextCursor).toBeNull()
  })

  test('offset salta filas y respeta el tamaño de página', () => {
    const rows = [
      row({ item_id: 'a', updated_at: '2026-06-05T00:00:00.000Z' }),
      row({ item_id: 'b', updated_at: '2026-06-04T00:00:00.000Z' }),
      row({ item_id: 'c', updated_at: '2026-06-03T00:00:00.000Z' }),
      row({ item_id: 'd', updated_at: '2026-06-02T00:00:00.000Z' }),
    ]
    const result = sortAndPaginate(rows, {
      orden: 'modificado-desc',
      limit: 2,
      offset: 2,
    })
    expect(result.items.map((r) => r.item_id)).toEqual(['c', 'd'])
    expect(result.nextCursor).toBeNull()
  })

  test('orden por nombre es case-insensitive', () => {
    const rows = [
      row({ item_id: '1', title: 'banana' }),
      row({ item_id: '2', title: 'Apple' }),
      row({ item_id: '3', title: 'cherry' }),
    ]
    const asc = sortAndPaginate(rows, { orden: 'nombre-asc', limit: 10, offset: 0 })
    expect(asc.items.map((r) => r.title)).toEqual(['Apple', 'banana', 'cherry'])
    const desc = sortAndPaginate(rows, { orden: 'nombre-desc', limit: 10, offset: 0 })
    expect(desc.items.map((r) => r.title)).toEqual(['cherry', 'banana', 'Apple'])
  })

  test('orden por creado usa created_at (no updated_at)', () => {
    // created_at y updated_at deliberadamente desalineados: 'a' se modificó
    // último pero se creó primero, así el orden por creado difiere del de
    // modificado.
    const rows = [
      row({
        item_id: 'a',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-09T00:00:00.000Z',
      }),
      row({
        item_id: 'b',
        created_at: '2026-06-05T00:00:00.000Z',
        updated_at: '2026-06-06T00:00:00.000Z',
      }),
    ]
    const desc = sortAndPaginate(rows, { orden: 'creado-desc', limit: 10, offset: 0 })
    expect(desc.items.map((r) => r.item_id)).toEqual(['b', 'a'])
    const asc = sortAndPaginate(rows, { orden: 'creado-asc', limit: 10, offset: 0 })
    expect(asc.items.map((r) => r.item_id)).toEqual(['a', 'b'])
  })

  test('orden por tamaño deja los nulls al final en ambas direcciones', () => {
    const rows = [
      row({ item_id: 'small', byte_size: 10 }),
      row({ item_id: 'null', byte_size: null }),
      row({ item_id: 'big', byte_size: 100 }),
    ]
    const desc = sortAndPaginate(rows, { orden: 'tamano-desc', limit: 10, offset: 0 })
    expect(desc.items.map((r) => r.item_id)).toEqual(['big', 'small', 'null'])
    const asc = sortAndPaginate(rows, { orden: 'tamano-asc', limit: 10, offset: 0 })
    expect(asc.items.map((r) => r.item_id)).toEqual(['small', 'big', 'null'])
  })

  test('desempata de forma estable por item_id', () => {
    const ts = '2026-06-01T00:00:00.000Z'
    const rows = [
      row({ item_id: 'c', updated_at: ts }),
      row({ item_id: 'a', updated_at: ts }),
      row({ item_id: 'b', updated_at: ts }),
    ]
    const result = sortAndPaginate(rows, {
      orden: 'modificado-desc',
      limit: 10,
      offset: 0,
    })
    expect(result.items.map((r) => r.item_id)).toEqual(['a', 'b', 'c'])
  })

  test('los items fijados van primero, sea cual sea el orden', () => {
    const rows = [
      row({ item_id: 'a', title: 'Apple', pinned: false }),
      row({ item_id: 'z', title: 'Zeta', pinned: true }),
      row({ item_id: 'b', title: 'Bravo', pinned: false }),
    ]
    // 'Zeta' está fijado → va primero aunque alfabéticamente iría último.
    const asc = sortAndPaginate(rows, { orden: 'nombre-asc', limit: 10, offset: 0 })
    expect(asc.items.map((r) => r.item_id)).toEqual(['z', 'a', 'b'])
  })
})

describe('fetchLibraryRows SQL', () => {
  const sql = setupMockSql().getSql()

  test('la query une las 6 fuentes, decora con overrides y filtra por usuario', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([])

    await fetchLibraryRows(sql, 'legacy-single-user', {
      q: 'mar',
      tab: 'imagenes',
      tipo: 'image',
      fuente: 'whatsapp',
      tag: 'factura',
      incluyeEliminados: false,
    })

    const call = mockSqlState.calls.at(-1)
    expect(call).toBeDefined()
    const template = call!.template

    // Las 6 fuentes nativas + la tabla decoradora.
    for (const table of [
      'notas_attachments',
      'recorte_images',
      'recortes',
      'momentos',
      'pdf_studio_saved_pdfs',
      'pdf_stamp_assets',
      'library_item_overrides',
    ]) {
      expect(template, `query debe referenciar ${table}`).toMatch(
        new RegExp(`\\b${table}\\b`),
      )
    }

    // Estructura del read-model.
    expect(template).toMatch(/WITH base AS/i)
    expect(template).toMatch(/UNION ALL/i)
    expect(template).toMatch(/LEFT JOIN library_item_overrides/i)
    expect(template).toMatch(/COALESCE\(o\.display_title, base\.title_native\)/i)

    // Soft-delete nativo en las ramas con deleted_at.
    expect(template).toMatch(/deleted_at IS NULL/i)

    // Filtros centinela parametrizados (q, tab, tipo, fuente, tag, incluyeEliminados).
    expect(template).toMatch(/file_type = /i)
    expect(template).toMatch(/source = /i)
    expect(template).toMatch(/= ANY\(COALESCE\(tags/i)
    expect(template).toMatch(/title ILIKE/i)
    expect(template).toMatch(/lib_deleted_at IS (NOT )?NULL/i)

    // Los valores de filtro + el userId entran como bind params (RLS explícito).
    expect(call!.values).toContain('legacy-single-user')
    expect(call!.values).toContain('mar')
    expect(call!.values).toContain('image')
    expect(call!.values).toContain('whatsapp')
    expect(call!.values).toContain('factura')
    expect(call!.values).toContain(false)
    expect(call!.values).toContain('imagenes')
  })

  test('reenvía las filas crudas (sin transformar) del driver', async () => {
    mockSqlResponses.reset()
    const fixture = row({ item_id: 'x1' })
    mockSqlResponses.push([fixture])

    const rows = await fetchLibraryRows(sql, 'legacy-single-user', {
      q: '',
      tab: 'todo',
      tipo: '',
      fuente: '',
      tag: '',
      incluyeEliminados: false,
    })
    expect(rows).toEqual([fixture])
  })
})
