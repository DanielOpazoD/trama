import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { parseRows } from './row-parse.js'
import { RecorteRowSchema } from './recortes-service.js'

/**
 * E6 — `parseRows` cierra el hueco de `sqlTyped` (cast sin validación). Acá se
 * prueba el helper genérico y el schema fiel de recortes: una fila completa
 * pasa; una fila con columna faltante o tipo equivocado lanza con el context de
 * la query, de modo que un drift de SELECT futuro falle en runtime (atrapable
 * por withObservability) en vez de devolver datos truncados en silencio.
 */

const Row = z.object({
  id: z.string(),
  name: z.string(),
  count: z.number(),
})

/** Fila realista que matchea la proyección canónica de 16 columnas. */
function buildCanonicalRecorteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '6f9619ff-8b86-4d01-b42d-00cf4fc964ff',
    text: 'La memoria es un taller.',
    source_url: 'https://example.com/x',
    source_title: 'El taller',
    source_author: null,
    note: null,
    image_url: null,
    image_key: null,
    capture_mode: 'citation',
    status: 'pending',
    promoted_target: null,
    promoted_id: null,
    captured_at: '2026-06-10T12:00:00.000Z',
    created_at: '2026-06-10T12:00:00.000Z',
    updated_at: '2026-06-10T12:00:00.000Z',
    ...overrides,
  }
}

describe('parseRows', () => {
  it('devuelve las filas tipadas cuando todas validan', () => {
    const rows = parseRows(
      [
        { id: 'a', name: 'uno', count: 1 },
        { id: 'b', name: 'dos', count: 2 },
      ],
      Row,
      'test.ok',
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].name).toBe('uno')
  })

  it('acepta un resultado vacío (0 filas es válido)', () => {
    expect(parseRows([], Row, 'test.empty')).toEqual([])
  })

  it('lanza con el context cuando falta una columna', () => {
    expect(() =>
      // `count` ausente: simula un SELECT que dejó de proyectar la columna.
      parseRows([{ id: 'a', name: 'uno' }], Row, 'test.missing-column'),
    ).toThrow(/test\.missing-column/)
  })

  it('lanza con el context y el path cuando el tipo es equivocado', () => {
    expect(() =>
      parseRows(
        [{ id: 'a', name: 'uno', count: 'no-es-numero' }],
        Row,
        'test.wrong-type',
      ),
    ).toThrow(/test\.wrong-type.*count/s)
  })

  it('lanza si el resultado no es un array (shape inesperado del driver)', () => {
    expect(() =>
      parseRows({ id: 'a', name: 'x', count: 1 }, Row, 'test.not-array'),
    ).toThrow(/test\.not-array/)
  })
})

describe('RecorteRowSchema', () => {
  it('acepta una fila realista de la proyección canónica', () => {
    const [row] = parseRows(
      [buildCanonicalRecorteRow()],
      RecorteRowSchema,
      'recortes.promote.quote',
    )
    expect(row.status).toBe('pending')
    expect(row.source_author).toBeNull()
    expect(row.capture_mode).toBe('citation')
  })

  it('acepta los nullables y los enums en sus valores válidos', () => {
    const [row] = parseRows(
      [
        buildCanonicalRecorteRow({
          capture_mode: null,
          status: 'promoted',
          promoted_target: 'momento',
          promoted_id: '22222222-2222-4222-8222-222222222222',
          captured_at: null,
        }),
      ],
      RecorteRowSchema,
      'recortes.unpromote',
    )
    expect(row.promoted_target).toBe('momento')
    expect(row.captured_at).toBeNull()
  })

  it('rechaza una fila a la que un SELECT futuro le omitió image_key', () => {
    const { image_key: _omitted, ...broken } = buildCanonicalRecorteRow()
    expect(() =>
      parseRows([broken], RecorteRowSchema, 'recortes.promote.entity'),
    ).toThrow(/recortes\.promote\.entity.*image_key/s)
  })

  it('rechaza un status fuera del enum del CHECK', () => {
    expect(() =>
      parseRows(
        [buildCanonicalRecorteRow({ status: 'inventado' })],
        RecorteRowSchema,
        'recortes.promote.quote',
      ),
    ).toThrow(/recortes\.promote\.quote.*status/s)
  })

  it('rechaza un created_at no-string (NOT NULL del esquema)', () => {
    expect(() =>
      parseRows(
        [buildCanonicalRecorteRow({ created_at: null })],
        RecorteRowSchema,
        'recortes.unpromote',
      ),
    ).toThrow(/recortes\.unpromote.*created_at/s)
  })
})
