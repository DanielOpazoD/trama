import { describe, expect, it } from 'vitest'
import { newFieldBoxFromDrag } from './pdfFormFieldPointer'

const layout = { innerW: 400, innerH: 500, outerW: 400, outerH: 500, rot: 0 as const }
const fallback = { xRatio: 0.2, yRatio: 0.42, wRatio: 0.32, hRatio: 0.055 }

function expectBox(
  box: ReturnType<typeof newFieldBoxFromDrag>,
  expected: ReturnType<typeof newFieldBoxFromDrag>,
) {
  expect(box.xRatio).toBeCloseTo(expected.xRatio)
  expect(box.yRatio).toBeCloseTo(expected.yRatio)
  expect(box.wRatio).toBeCloseTo(expected.wRatio)
  expect(box.hRatio).toBeCloseTo(expected.hRatio)
}

describe('newFieldBoxFromDrag', () => {
  it('usa tamaño estándar centrado cuando solo hay clic', () => {
    expectBox(
      newFieldBoxFromDrag({
        currentClientX: 201,
        currentClientY: 151,
        fallback,
        layout,
        startClientX: 200,
        startClientY: 150,
        startOffsetX: 200,
        startOffsetY: 150,
        zoom: 1,
      }),
      { xRatio: 0.34, yRatio: 0.2725, wRatio: 0.32, hRatio: 0.055 },
    )
  })

  it('crea el casillero con el rectángulo exacto del arrastre', () => {
    expectBox(
      newFieldBoxFromDrag({
        currentClientX: 320,
        currentClientY: 210,
        fallback,
        layout,
        startClientX: 200,
        startClientY: 150,
        startOffsetX: 200,
        startOffsetY: 150,
        zoom: 1,
      }),
      { xRatio: 0.5, yRatio: 0.3, wRatio: 0.3, hRatio: 0.12 },
    )
  })
})
