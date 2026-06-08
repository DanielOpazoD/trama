import { describe, expect, it, vi } from 'vitest'
import { applyPdfAnnotations } from './assembleAnnotations'
import { makeShapeAnnotation } from '../model/model'

const rgb = ((r: number, g: number, b: number) => ({ r, g, b })) as unknown as Parameters<
  typeof applyPdfAnnotations
>[0]['rgb']

function setup() {
  const drawLine = vi.fn()
  const outPage = {
    getWidth: () => 400,
    getHeight: () => 600,
    drawLine,
  } as unknown as Parameters<typeof applyPdfAnnotations>[0]['outPage']
  return { outPage, drawLine }
}

async function exportX(disabled?: boolean) {
  const { outPage, drawLine } = setup()
  const x = makeShapeAnnotation({
    shape: 'x',
    x0Ratio: 0.1,
    y0Ratio: 0.1,
    x1Ratio: 0.2,
    y1Ratio: 0.2,
    color: '#222222',
    strokeRatio: 0.006,
    disabled,
  })
  await applyPdfAnnotations({
    out: {} as Parameters<typeof applyPdfAnnotations>[0]['out'],
    outPage,
    annotations: [x],
    fontFor: vi.fn(),
    rgb,
    degrees: vi.fn(),
    skipped: [],
  })
  return drawLine
}

describe('applyPdfAnnotations · marca X', () => {
  it('dibuja la X como las dos diagonales del bounding box (coords PDF con Y invertida)', async () => {
    const drawLine = await exportX()
    expect(drawLine).toHaveBeenCalledTimes(2)
    const a = drawLine.mock.calls[0]![0] as {
      start: { x: number; y: number }
      end: { x: number; y: number }
    }
    const b = drawLine.mock.calls[1]![0] as {
      start: { x: number; y: number }
      end: { x: number; y: number }
    }
    expect(a.start).toEqual({ x: 40, y: 480 })
    expect(a.end).toEqual({ x: 80, y: 540 })
    expect(b.start).toEqual({ x: 80, y: 480 })
    expect(b.end).toEqual({ x: 40, y: 540 })
  })

  it('una X activa se dibuja con su color; una deshabilitada NO se imprime', async () => {
    const active = await exportX(false)
    expect(active).toHaveBeenCalledTimes(2)
    const activeColor = active.mock.calls[0]![0] as { color: { r: number } }
    expect(activeColor.color.r).toBeCloseTo(0x22 / 255, 5)

    // Gris claro = casillero apagado: no se dibuja ninguna línea en el PDF.
    const off = await exportX(true)
    expect(off).not.toHaveBeenCalled()
  })
})
