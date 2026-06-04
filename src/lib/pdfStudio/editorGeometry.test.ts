import { describe, it, expect } from 'vitest'
import { fitPageLayout, rectFromPoints, screenDeltaToPage } from './editorGeometry'

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
