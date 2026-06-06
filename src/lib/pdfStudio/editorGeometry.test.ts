import { describe, it, expect } from 'vitest'
import {
  fitImageStampBox,
  fitPageLayout,
  rectFromPoints,
  resizeRatioBox,
  screenDeltaToPage,
} from './editorGeometry'

describe('pdfStudio/editorGeometry · screenDeltaToPage', () => {
  it('rot 0 deja el delta igual', () => {
    expect(screenDeltaToPage(10, 5, 0)).toEqual({ dx: 10, dy: 5 })
  })

  it('rota el delta 90/180/270 (inversa de la rotación CSS)', () => {
    expect(screenDeltaToPage(10, 5, 1)).toEqual({ dx: 5, dy: -10 })
    expect(screenDeltaToPage(10, 5, 2)).toEqual({ dx: -10, dy: -5 })
    expect(screenDeltaToPage(10, 5, 3)).toEqual({ dx: -5, dy: 10 })
  })

  it('normaliza cuartos fuera de 0..3 (5≡1, -1≡3)', () => {
    expect(screenDeltaToPage(10, 5, 5)).toEqual({ dx: 5, dy: -10 })
    expect(screenDeltaToPage(10, 5, -1)).toEqual({ dx: -5, dy: 10 })
  })
})

describe('pdfStudio/editorGeometry · rectFromPoints', () => {
  it('normaliza dos puntos a esquina sup-izq + tamaño', () => {
    expect(rectFromPoints(10, 20, 16, 28)).toEqual({ x: 10, y: 20, w: 6, h: 8 })
  })

  it('funciona con los puntos en cualquier orden', () => {
    expect(rectFromPoints(16, 28, 10, 20)).toEqual({ x: 10, y: 20, w: 6, h: 8 })
  })
})

describe('pdfStudio/editorGeometry · fitPageLayout', () => {
  it('vertical: limita por ALTO y mantiene el aspecto', () => {
    // página 400×600 (vertical) en un área ancha 1000×800
    const l = fitPageLayout(400, 600, 1000, 800, 0)
    expect(l.rot).toBe(0)
    expect(l.outerH).toBeCloseTo(768) // 800 − 32 (margen)
    expect(l.outerW).toBeCloseTo(512) // 768 / (600/400)
    expect(l.innerW).toBeCloseTo(512)
    expect(l.innerH).toBeCloseTo(768)
    expect(l.innerH / l.innerW).toBeCloseTo(600 / 400) // aspecto nativo
  })

  it('horizontal: limita por ANCHO', () => {
    const l = fitPageLayout(800, 400, 600, 800, 0)
    expect(l.outerW).toBeCloseTo(568) // 600 − 32
    expect(l.outerH).toBeCloseTo(284) // 568 · (400/800)
  })

  it('rotada 90°: intercambia interior/exterior y normaliza el cuarto', () => {
    const l = fitPageLayout(400, 600, 1000, 800, 1)
    expect(l.rot).toBe(1)
    // la INTERIOR es la página nativa (400×600) → su aspecto se conserva
    expect(l.innerH / l.innerW).toBeCloseTo(600 / 400)
    // la EXTERIOR es el bounding box rotado (más ancho que alto)
    expect(l.outerW).toBeGreaterThan(l.outerH)
    expect(fitPageLayout(400, 600, 1000, 800, 5).rot).toBe(1) // 5 ≡ 1
  })
})

describe('pdfStudio/editorGeometry · fitImageStampBox', () => {
  it('centra la imagen y conserva su aspecto en ratios de página', () => {
    const box = fitImageStampBox({ pageW: 1000, pageH: 1400, imageW: 800, imageH: 400 })
    expect(box.xRatio).toBeCloseTo((1 - 0.28) / 2)
    expect(box.wRatio).toBeCloseTo(0.28)
    // 0.28*1000 px de ancho / aspecto 2 = 140 px de alto; 140/1400 = 0.1
    expect(box.hRatio).toBeCloseTo(0.1)
    expect(box.yRatio).toBeCloseTo((1 - 0.1) / 2)
  })

  it('acota imágenes extremadamente verticales para que sigan manipulables', () => {
    const box = fitImageStampBox({ pageW: 1000, pageH: 1400, imageW: 100, imageH: 1000 })
    expect(box.hRatio).toBeLessThanOrEqual(0.32)
    expect(box.yRatio).toBeGreaterThanOrEqual(0)
  })
})

describe('pdfStudio/editorGeometry · resizeRatioBox', () => {
  it('agranda una caja desde la esquina inferior derecha y la mantiene dentro de la página', () => {
    const out = resizeRatioBox(
      { xRatio: 0.1, yRatio: 0.2, wRatio: 0.3, hRatio: 0.2 },
      'se',
      0.15,
      0.1,
    )
    expect(out.xRatio).toBeCloseTo(0.1)
    expect(out.yRatio).toBeCloseTo(0.2)
    expect(out.wRatio).toBeCloseTo(0.45)
    expect(out.hRatio).toBeCloseTo(0.3)
  })

  it('respeta tamaño mínimo al arrastrar la esquina superior izquierda', () => {
    const out = resizeRatioBox(
      { xRatio: 0.2, yRatio: 0.2, wRatio: 0.2, hRatio: 0.2 },
      'nw',
      0.19,
      0.18,
      { minW: 0.06, minH: 0.04 },
    )
    expect(out.xRatio).toBeCloseTo(0.34)
    expect(out.yRatio).toBeCloseTo(0.36)
    expect(out.wRatio).toBeCloseTo(0.06)
    expect(out.hRatio).toBeCloseTo(0.04)
  })
})
