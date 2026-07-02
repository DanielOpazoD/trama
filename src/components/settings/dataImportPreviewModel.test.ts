import { describe, expect, it } from 'vitest'
import type { ExportPayload, ImportResult } from '../../types'
import {
  buildPreview,
  buildExistingImportIdSets,
  formatImportResultMessage,
  parseImportPayloadText,
} from './dataImportPreviewModel'

describe('dataImportPreviewModel helpers', () => {
  it('cuenta existentes, filas sin id y duplicados dentro del mismo payload', () => {
    const payload = {
      version: 1,
      exportedAt: '2026-06-30T12:00:00Z',
      entities: [
        {
          id: 'new-1',
          name: 'Nueva',
          type: 'persona',
          origin: { kind: 'manual' },
          createdAt: '2026-06-30T12:00:00Z',
          updatedAt: '2026-06-30T12:00:00Z',
        },
        {
          id: 'new-1',
          name: 'Repetida',
          type: 'persona',
          origin: { kind: 'manual' },
          createdAt: '2026-06-30T12:00:00Z',
          updatedAt: '2026-06-30T12:00:00Z',
        },
        {
          id: 'existing-1',
          name: 'Existente',
          type: 'persona',
          origin: { kind: 'manual' },
          createdAt: '2026-06-30T12:00:00Z',
          updatedAt: '2026-06-30T12:00:00Z',
        },
        { name: 'Sin id', type: 'persona', origin: { kind: 'manual' } },
      ],
      relationships: [],
      quotes: [],
      momentos: [],
      notes: [],
      tasks: [],
    } as unknown as ExportPayload

    expect(
      buildPreview(payload, new Set(['existing-1']), new Set(), new Set()),
    ).toMatchObject({
      entities: { incoming: 4, news: 1, duplicates: 3 },
      totalIncoming: 4,
      totalNew: 1,
      totalDuplicates: 3,
    })
  })

  it('parsea payloads v1/v2 y conserva el nombre del archivo', () => {
    const payload: ExportPayload = {
      version: 2,
      exportedAt: '2026-07-02T00:00:00Z',
      entities: [],
      relationships: [],
      quotes: [],
      notes: [],
      tasks: [],
    }

    expect(parseImportPayloadText(JSON.stringify(payload), 'trama.json')).toEqual({
      payload,
      fileName: 'trama.json',
    })
  })

  it('rechaza JSON inválido, versiones no soportadas y payloads no objeto', () => {
    expect(() => parseImportPayloadText('{', 'bad.json')).toThrow()
    expect(() =>
      parseImportPayloadText(JSON.stringify({ version: 3 }), 'future.json'),
    ).toThrow('versión 3 no soportada')
    expect(() => parseImportPayloadText('null', 'null.json')).toThrow('payload inválido')
  })

  it('formatea mensajes de import exitoso y con fallas truncadas', () => {
    expect(formatImportResultMessage({ imported: 3 })).toBe(
      'Agregadas 3 entradas a tu trama',
    )

    const result: ImportResult = {
      imported: 2,
      failed: [
        {
          kind: 'entity',
          id: 'e1',
          reason:
            'razón extremadamente larga que no debería ocupar todo el panel de datos',
        },
      ],
    }

    expect(formatImportResultMessage(result)).toBe(
      'Agregadas 2, 1 con error (primero: razón extremadamente larga que no debería ocupar todo el pan). Revisa Logs en Settings.',
    )
  })

  it('centraliza sets de IDs existentes para el preview', () => {
    const sets = buildExistingImportIdSets({
      entities: [{ id: 'e1' }],
      relationships: [{ id: 'r1' }],
      quotes: [{ id: 'q1' }],
      momentos: [{ id: 'm1' }],
      notes: [{ id: 'n1' }],
      tasks: [{ id: 't1' }],
    })

    expect(sets.entityIds.has('e1')).toBe(true)
    expect(sets.relationshipIds.has('r1')).toBe(true)
    expect(sets.quoteIds.has('q1')).toBe(true)
    expect(sets.momentoIds.has('m1')).toBe(true)
    expect(sets.noteIds.has('n1')).toBe(true)
    expect(sets.taskIds.has('t1')).toBe(true)
  })
})
