import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CaptureItem } from '../../api/notasFeed'
import { feedMeasureSignature, useMeasuredVirtualFeed } from './useMeasuredVirtualFeed'

function note(id: string, updatedAt: string, hasImages = false): CaptureItem {
  return {
    type: 'note',
    id,
    createdAt: updatedAt,
    note: {
      id,
      title: null,
      content: `nota ${id}`,
      tags: [],
      pinned: false,
      promotedMomentoId: null,
      createdAt: updatedAt,
      updatedAt,
      hasImages,
    },
  }
}

function recorte(
  id: string,
  updatedAt: string,
  text = 'recorte',
  imageKey: string | null = null,
): CaptureItem {
  return {
    type: 'recorte',
    id,
    createdAt: updatedAt,
    recorte: {
      id,
      text,
      sourceUrl: null,
      sourceTitle: null,
      sourceAuthor: null,
      note: null,
      imageUrl: null,
      imageKey,
      captureMode: 'citation',
      status: 'pending',
      promotedTarget: null,
      promotedId: null,
      capturedAt: null,
      createdAt: updatedAt,
      updatedAt,
    },
  }
}

describe('useMeasuredVirtualFeed', () => {
  it('builds a signature from height-affecting feed fields', () => {
    expect(
      feedMeasureSignature([
        note('n1', '2026-06-10T00:00:00.000Z', true),
        recorte('r1', '2026-06-11T00:00:00.000Z', 'texto largo', 'img-1'),
      ]),
    ).toBe('n:n1:2026-06-10T00:00:00.000Z:1|r:r1:2026-06-11T00:00:00.000Z:img-1::11')
  })

  it('measures with the current virtualizer when feed shape changes', () => {
    const firstMeasure = vi.fn()
    const secondMeasure = vi.fn()
    const firstVirtualizer = { measure: firstMeasure }
    const secondVirtualizer = { measure: secondMeasure }

    const { rerender } = renderHook(
      ({ items, virtualizer }) =>
        useMeasuredVirtualFeed({ items, recorteThumb: 'mediana', virtualizer }),
      {
        initialProps: {
          items: [note('n1', '2026-06-10T00:00:00.000Z')],
          virtualizer: firstVirtualizer,
        },
      },
    )

    expect(firstMeasure).toHaveBeenCalledTimes(1)

    rerender({
      items: [note('n1', '2026-06-10T00:00:00.000Z')],
      virtualizer: secondVirtualizer,
    })
    rerender({
      items: [
        note('n1', '2026-06-10T00:00:00.000Z'),
        recorte('r1', '2026-06-11T00:00:00.000Z'),
      ],
      virtualizer: secondVirtualizer,
    })

    expect(firstMeasure).toHaveBeenCalledTimes(1)
    expect(secondMeasure).toHaveBeenCalledTimes(1)
  })
})
