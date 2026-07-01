import { describe, expect, it } from 'vitest'
import type { ExportPayload } from '../../types'
import { buildPreview } from './dataImportPreviewModel'

describe('dataImportPreviewModel', () => {
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
})
