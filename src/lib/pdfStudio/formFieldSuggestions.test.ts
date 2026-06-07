import { describe, expect, it } from 'vitest'
import {
  detectHorizontalRunsFromPixels,
  suggestTextFieldsFromHorizontalRuns,
} from './formFieldSuggestions'

describe('formFieldSuggestions', () => {
  it('sugiere casilleros desde líneas horizontales y evita duplicados cercanos', () => {
    const suggestions = suggestTextFieldsFromHorizontalRuns({
      pageId: 'p1',
      pageWidth: 1000,
      pageHeight: 1400,
      runs: [
        { x: 120, y: 320, width: 420, height: 2 },
        { x: 120, y: 420, width: 420, height: 2 },
        { x: 130, y: 423, width: 410, height: 2 },
        { x: 100, y: 500, width: 45, height: 2 },
      ],
      existingFields: [
        {
          pageId: 'p1',
          xRatio: 0.12,
          yRatio: 0.2,
          wRatio: 0.42,
          hRatio: 0.045,
        },
      ],
    })

    expect(suggestions).toEqual([
      expect.objectContaining({
        pageId: 'p1',
        fieldKind: 'text',
        name: 'campo_1',
        xRatio: expect.closeTo(0.12, 2),
        yRatio: expect.closeTo(0.272, 2),
        wRatio: expect.closeTo(0.42, 2),
      }),
    ])
  })

  it('detecta trazos horizontales oscuros desde pixeles de una página', () => {
    const width = 200
    const height = 100
    const data = new Uint8ClampedArray(width * height * 4).fill(255)
    for (let x = 30; x <= 170; x += 1) {
      const i = (50 * width + x) * 4
      data[i] = 40
      data[i + 1] = 40
      data[i + 2] = 40
      data[i + 3] = 255
    }

    expect(detectHorizontalRunsFromPixels(data, width, height)).toEqual([
      expect.objectContaining({ x: 30, y: 50, width: 141 }),
    ])
  })
})
