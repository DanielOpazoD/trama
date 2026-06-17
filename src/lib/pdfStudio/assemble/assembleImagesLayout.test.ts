import { fitImageInsideBox, imageGridBoxes } from './assembleImages'

describe('pdfStudio/assembleImages layout', () => {
  it('crea grillas imprimibles con márgenes para los conteos soportados', () => {
    for (const count of [1, 2, 3, 4, 6] as const) {
      const boxes = imageGridBoxes(count)
      expect(boxes).toHaveLength(count)
      expect(boxes.every((box) => box.x > 0 && box.y > 0 && box.w > 0 && box.h > 0)).toBe(
        true,
      )
    }
  })

  it('ajusta la imagen dentro de la caja sin recortarla ni deformarla', () => {
    const fitted = fitImageInsideBox(2000, 1000, { x: 10, y: 20, w: 400, h: 400 })

    expect(fitted.width).toBe(400)
    expect(fitted.height).toBe(200)
    expect(fitted.x).toBe(10)
    expect(fitted.y).toBe(120)
  })
})
