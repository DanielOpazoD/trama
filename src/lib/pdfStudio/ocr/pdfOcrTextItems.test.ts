import { describe, expect, it } from 'vitest'
import { ocrWordsToTextItems } from './pdfOcrTextItems'

const word = (
  text: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  confidence = 90,
) => ({
  text,
  confidence,
  bbox: { x0, y0, x1, y1 },
})

describe('ocrWordsToTextItems', () => {
  it('convierte palabras con caja a ratios top-down y filtra baja confianza', () => {
    const items = ocrWordsToTextItems(
      {
        blocks: [
          {
            paragraphs: [
              {
                lines: [
                  {
                    words: [
                      word('Nombre:', 100, 200, 180, 220),
                      word('ruido', 300, 200, 340, 220, 12),
                      word('  ', 400, 200, 410, 220),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      1000,
      500,
    )
    expect(items).toEqual([
      { text: 'Nombre:', xRatio: 0.1, yRatio: 0.4, wRatio: 0.08, hRatio: 0.04 },
    ])
  })

  it('sin bloques devuelve vacío', () => {
    expect(ocrWordsToTextItems({ blocks: null }, 100, 100)).toEqual([])
  })
})
