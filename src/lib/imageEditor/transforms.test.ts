import { describe, it, expect } from 'vitest'
import {
  clampCrop,
  colorHexFor,
  cropRectToSourcePx,
  defaultModel,
  displayToNorm,
  fontFamilyFor,
  fontWeightFor,
  isIdentityModel,
  moveCrop,
  resizeCrop,
  rotatedDimensions,
  textPx,
  textPxOnCrop,
} from './transforms'
import type { CropRect, TextPalette } from './types'

const FULL: CropRect = { xN: 0, yN: 0, wN: 1, hN: 1 }

describe('imageEditor/transforms', () => {
  describe('defaultModel / isIdentityModel', () => {
    it('el modelo por defecto es identidad', () => {
      const m = defaultModel()
      expect(m).toEqual({ rotationQuarters: 0, crop: FULL, textLayers: [] })
      expect(isIdentityModel(m)).toBe(true)
    })
    it('deja de ser identidad con rotación, recorte o texto', () => {
      expect(isIdentityModel({ ...defaultModel(), rotationQuarters: 1 })).toBe(false)
      expect(
        isIdentityModel({ ...defaultModel(), crop: { xN: 0.1, yN: 0, wN: 0.9, hN: 1 } }),
      ).toBe(false)
      expect(
        isIdentityModel({
          ...defaultModel(),
          textLayers: [
            {
              id: 'a',
              text: 'x',
              xN: 0,
              yN: 0,
              font: 'sans',
              size: 'M',
              bold: false,
              color: 'ink',
            },
          ],
        }),
      ).toBe(false)
    })
  })

  describe('rotatedDimensions', () => {
    it('0 y 180 mantienen; 90 y 270 intercambian', () => {
      expect(rotatedDimensions(800, 600, 0)).toEqual({ width: 800, height: 600 })
      expect(rotatedDimensions(800, 600, 2)).toEqual({ width: 800, height: 600 })
      expect(rotatedDimensions(800, 600, 1)).toEqual({ width: 600, height: 800 })
      expect(rotatedDimensions(800, 600, 3)).toEqual({ width: 600, height: 800 })
    })
    it('normaliza cuartos fuera de rango (negativos / >3)', () => {
      expect(rotatedDimensions(800, 600, 5)).toEqual({ width: 600, height: 800 }) // 5%4=1
      expect(rotatedDimensions(800, 600, -1)).toEqual({ width: 600, height: 800 }) // -1 → 3
    })
  })

  describe('cropRectToSourcePx', () => {
    it('recorte completo → toda la fuente', () => {
      expect(cropRectToSourcePx(FULL, 800, 600)).toEqual({
        sx: 0,
        sy: 0,
        sw: 800,
        sh: 600,
      })
    })
    it('media imagen centrada → píxeles correctos', () => {
      expect(
        cropRectToSourcePx({ xN: 0.25, yN: 0.25, wN: 0.5, hN: 0.5 }, 800, 600),
      ).toEqual({
        sx: 200,
        sy: 150,
        sw: 400,
        sh: 300,
      })
    })
    it('clampa para no salirse de la fuente y nunca queda en 0px', () => {
      const r = cropRectToSourcePx({ xN: 0.9, yN: 0.9, wN: 0.5, hN: 0.5 }, 800, 600)
      expect(r.sx + r.sw).toBeLessThanOrEqual(800)
      expect(r.sy + r.sh).toBeLessThanOrEqual(600)
      const tiny = cropRectToSourcePx({ xN: 0, yN: 0, wN: 0.0001, hN: 0.0001 }, 10, 10)
      expect(tiny.sw).toBeGreaterThanOrEqual(1)
      expect(tiny.sh).toBeGreaterThanOrEqual(1)
    })
  })

  describe('displayToNorm', () => {
    it('mapea esquinas a 0 y 1 y clampa fuera de la caja', () => {
      expect(displayToNorm(0, 0, 200, 100)).toEqual({ xN: 0, yN: 0 })
      expect(displayToNorm(200, 100, 200, 100)).toEqual({ xN: 1, yN: 1 })
      expect(displayToNorm(100, 50, 200, 100)).toEqual({ xN: 0.5, yN: 0.5 })
      expect(displayToNorm(-50, 250, 200, 100)).toEqual({ xN: 0, yN: 1 })
    })
    it('caja de tamaño 0 no divide por cero', () => {
      expect(displayToNorm(10, 10, 0, 0)).toEqual({ xN: 0, yN: 0 })
    })
  })

  describe('clampCrop', () => {
    it('respeta tamaño mínimo y mantiene dentro de [0,1]', () => {
      // xN<0 → 0; wN>1 → 1; hN<min → 0.05; yN=0.5 ya cabe (≤1-0.05) → se queda.
      const r = clampCrop({ xN: -0.2, yN: 0.5, wN: 2, hN: 0.01 })
      expect(r.xN).toBeCloseTo(0)
      expect(r.yN).toBeCloseTo(0.5)
      expect(r.wN).toBeCloseTo(1)
      expect(r.hN).toBeCloseTo(0.05)
      // yN fuera de rango sí se frena contra el borde inferior.
      const r2 = clampCrop({ xN: 0, yN: 0.99, wN: 0.5, hN: 0.5 })
      expect(r2.yN).toBeCloseTo(0.5)
    })
  })

  describe('moveCrop', () => {
    it('traslada y frena en los bordes sin cambiar tamaño', () => {
      const c: CropRect = { xN: 0.4, yN: 0.4, wN: 0.4, hN: 0.4 }
      const m1 = moveCrop(c, 0.1, -0.1)
      expect(m1.xN).toBeCloseTo(0.5)
      expect(m1.yN).toBeCloseTo(0.3)
      expect(m1.wN).toBeCloseTo(0.4)
      expect(m1.hN).toBeCloseTo(0.4)
      const m2 = moveCrop(c, 1, 1) // tope inferior-derecho
      expect(m2.xN).toBeCloseTo(0.6)
      expect(m2.yN).toBeCloseTo(0.6)
    })
  })

  describe('resizeCrop', () => {
    it('el handle SE mueve el borde derecho/inferior', () => {
      const c: CropRect = { xN: 0.2, yN: 0.2, wN: 0.4, hN: 0.4 }
      const r = resizeCrop(c, 'se', 0.1, 0.1)
      expect(r.xN).toBeCloseTo(0.2)
      expect(r.yN).toBeCloseTo(0.2)
      expect(r.wN).toBeCloseTo(0.5)
      expect(r.hN).toBeCloseTo(0.5)
    })
    it('el handle NW mueve el borde izquierdo/superior', () => {
      const c: CropRect = { xN: 0.2, yN: 0.2, wN: 0.4, hN: 0.4 }
      const r = resizeCrop(c, 'nw', -0.1, -0.1)
      expect(r.xN).toBeCloseTo(0.1)
      expect(r.yN).toBeCloseTo(0.1)
      expect(r.wN).toBeCloseTo(0.5)
      expect(r.hN).toBeCloseTo(0.5)
    })
    it('no invierte el rectángulo ni baja del mínimo', () => {
      const c: CropRect = { xN: 0.2, yN: 0.2, wN: 0.4, hN: 0.4 }
      const r = resizeCrop(c, 'w', 0.9, 0) // arrastre exagerado del borde izq
      expect(r.wN).toBeGreaterThanOrEqual(0.05)
      expect(r.xN + r.wN).toBeCloseTo(0.6) // el borde derecho no se movió
    })
  })

  describe('textPx', () => {
    it('escala la fuente con el lado menor y ubica por fracción', () => {
      const layer = { xN: 0.5, yN: 0.25, size: 'M' as const }
      const r = textPx(layer, 800, 400)
      expect(r.x).toBe(400)
      expect(r.y).toBe(100)
      expect(r.fontPx).toBeCloseTo(0.07 * 400) // lado menor = 400
    })
    it('S < M < L', () => {
      const at = (s: 'S' | 'M' | 'L') =>
        textPx({ xN: 0, yN: 0, size: s }, 1000, 1000).fontPx
      expect(at('S')).toBeLessThan(at('M'))
      expect(at('M')).toBeLessThan(at('L'))
    })
  })

  describe('textPxOnCrop', () => {
    const layer = { xN: 0.5, yN: 0.25, size: 'M' as const }

    it('sin recorte coincide con textPx (ancla = imagen completa)', () => {
      const full = { sx: 0, sy: 0, sw: 800, sh: 600 }
      const r = textPxOnCrop(layer, 800, 600, full, 800, 600)
      const base = textPx(layer, 800, 600)
      expect(r.x).toBeCloseTo(base.x)
      expect(r.y).toBeCloseTo(base.y)
      expect(r.fontPx).toBeCloseTo(base.fontPx)
    })

    it('con recorte, el texto se ubica relativo a la imagen completa, no al recorte', () => {
      // Recorte = mitad derecha (sx=400). xN=0.5 (centro de la imagen) cae
      // exactamente en el BORDE IZQUIERDO del recorte → x=0 en el lienzo final.
      const r = textPxOnCrop(
        layer,
        800,
        600,
        { sx: 400, sy: 0, sw: 400, sh: 600 },
        400,
        600,
      )
      expect(r.x).toBeCloseTo(0)
      expect(r.y).toBeCloseTo(150)
      // El tamaño sigue anclado al lado menor de la imagen ENTERA (texto "físico").
      expect(r.fontPx).toBeCloseTo(0.07 * 600)
    })

    it('el texto fuera del recorte cae fuera del lienzo (coordenada negativa)', () => {
      const left = { xN: 0.1, yN: 0.25, size: 'M' as const }
      const r = textPxOnCrop(
        left,
        800,
        600,
        { sx: 400, sy: 0, sw: 400, sh: 600 },
        400,
        600,
      )
      expect(r.x).toBeLessThan(0)
    })

    it('escala posición y tamaño cuando el lienzo final está reducido', () => {
      // Mismo recorte, pero salida a la mitad (tope de export) → todo a la mitad.
      const r = textPxOnCrop(
        layer,
        800,
        600,
        { sx: 400, sy: 0, sw: 400, sh: 600 },
        200,
        300,
      )
      expect(r.x).toBeCloseTo(0)
      expect(r.fontPx).toBeCloseTo(0.07 * 600 * 0.5)
    })
  })

  describe('font/weight/color', () => {
    it('mapea las 3 fuentes a stacks con la familia correcta', () => {
      expect(fontFamilyFor('sans')).toContain('Inter')
      expect(fontFamilyFor('serif')).toContain('Spectral')
      expect(fontFamilyFor('cursive')).toContain('Caveat')
    })
    it('negrita → 700, normal → 400', () => {
      expect(fontWeightFor(true)).toBe(700)
      expect(fontWeightFor(false)).toBe(400)
    })
    it('resuelve el color desde la paleta inyectada', () => {
      const palette: TextPalette = { ink: '#111', paper: '#fff', accent: '#0a3' }
      expect(colorHexFor('ink', palette)).toBe('#111')
      expect(colorHexFor('accent', palette)).toBe('#0a3')
    })
  })
})
