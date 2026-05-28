import { act, renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { usePanZoom } from './usePanZoom'

/**
 * Tests para usePanZoom — drag-to-pan + wheel-to-zoom para el SVG del
 * grafo. Verificamos:
 *  - Defaults: pan en (0,0), zoom inicial = 0.7.
 *  - zoomIn / zoomOut clamping a min/max.
 *  - resetView vuelve a default.
 *  - setPanTo cambia el pan.
 *  - startDrag / cancelDrag / draggingId.
 *  - screenToWorld respeta zoom + pan + tamaño del SVG.
 */

function makeRef() {
  const ref = createRef<SVGSVGElement>()
  // Simulamos un SVG con bounding box conocido para los tests de
  // screenToWorld. happy-dom no da bbox real para SVG sin layout, así
  // que stubeamos getBoundingClientRect.
  const fakeSvg = {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  } as unknown as SVGSVGElement
  ;(ref as { current: SVGSVGElement }).current = fakeSvg
  return ref
}

describe('usePanZoom', () => {
  it('defaults: pan (0,0), zoom 0.7, no panning, no dragging', () => {
    const ref = makeRef()
    const { result } = renderHook(() => usePanZoom(ref))
    expect(result.current.pan).toEqual({ x: 0, y: 0 })
    expect(result.current.zoom).toBe(0.7)
    expect(result.current.isPanning).toBe(false)
    expect(result.current.isDragging()).toBe(false)
    expect(result.current.draggingId()).toBeNull()
  })

  it('zoomIn aumenta el zoom (con clamp a max)', () => {
    const ref = makeRef()
    const { result } = renderHook(() => usePanZoom(ref, { maxZoom: 1.5 }))
    act(() => result.current.zoomIn())
    expect(result.current.zoom).toBeGreaterThan(0.7)
    // Múltiples zoomIn no exceden el max.
    for (let i = 0; i < 20; i++) act(() => result.current.zoomIn())
    expect(result.current.zoom).toBeLessThanOrEqual(1.5)
  })

  it('zoomOut disminuye el zoom (con clamp a min)', () => {
    const ref = makeRef()
    const { result } = renderHook(() => usePanZoom(ref, { minZoom: 0.4 }))
    act(() => result.current.zoomOut())
    expect(result.current.zoom).toBeLessThan(0.7)
    for (let i = 0; i < 20; i++) act(() => result.current.zoomOut())
    expect(result.current.zoom).toBeGreaterThanOrEqual(0.4)
  })

  it('resetView vuelve a defaults', () => {
    const ref = makeRef()
    const { result } = renderHook(() => usePanZoom(ref))
    act(() => result.current.zoomIn())
    act(() => result.current.setPanTo(100, 200))
    expect(result.current.pan).not.toEqual({ x: 0, y: 0 })
    act(() => result.current.resetView())
    expect(result.current.pan).toEqual({ x: 0, y: 0 })
    expect(result.current.zoom).toBe(0.7)
  })

  it('setPanTo centra el viewport en el punto world dado (pan invertido)', () => {
    // setPanTo(worldX, worldY) significa "que ese punto del mundo
    // quede en el centro del viewport". El pan resultante es -world
    // (mover el mundo en sentido contrario para que el target caiga
    // en el centro). Test verifica la convención.
    const ref = makeRef()
    const { result } = renderHook(() => usePanZoom(ref))
    act(() => result.current.setPanTo(123, 456))
    // El pan cambió y mantiene la relación: posición ≠ (0,0).
    expect(result.current.pan).not.toEqual({ x: 0, y: 0 })
    // Pan = -world (centrar el viewport).
    expect(result.current.pan).toEqual({ x: -123, y: -456 })
  })

  it('startDrag marca el nodo como dragging hasta cancelDrag', () => {
    const ref = makeRef()
    const { result } = renderHook(() => usePanZoom(ref))
    expect(result.current.draggingId()).toBeNull()
    act(() => result.current.startDrag('ent-1', { x: 5, y: 5 }))
    expect(result.current.isDragging()).toBe(true)
    expect(result.current.draggingId()).toBe('ent-1')
    act(() => result.current.cancelDrag())
    expect(result.current.draggingId()).toBeNull()
  })

  it('screenToWorld respeta el centro del SVG + zoom + pan', () => {
    const ref = makeRef()
    const { result } = renderHook(() => usePanZoom(ref, { defaultZoom: 1 }))
    // Con zoom=1 y pan (0,0), el centro del SVG (400, 300) mapea a (0,0).
    const center = result.current.screenToWorld(400, 300)
    expect(center.x).toBeCloseTo(0)
    expect(center.y).toBeCloseTo(0)
    // 100px a la derecha del centro = world (100, 0) a zoom 1.
    const right = result.current.screenToWorld(500, 300)
    expect(right.x).toBeCloseTo(100)
    expect(right.y).toBeCloseTo(0)
  })

  it('fitToView ajusta zoom+pan para que el bbox entre con padding', () => {
    const ref = makeRef()
    const { result } = renderHook(() => usePanZoom(ref))
    // Un bbox grande (500x400) en un SVG de 800x600 → zoom < 1.
    act(() => result.current.fitToView({ minX: 0, minY: 0, maxX: 500, maxY: 400 }, 20))
    // El zoom cambió y el pan también.
    expect(result.current.zoom).not.toBe(0.7)
    // El zoom debería ser razonable (no negativo, no infinito).
    expect(result.current.zoom).toBeGreaterThan(0)
    expect(result.current.zoom).toBeLessThan(3)
  })
})
