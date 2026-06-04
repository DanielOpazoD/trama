import { describe, it, expect } from 'vitest'
import { initHistory, pushHistory, undo, redo, canUndo, canRedo } from './history'

describe('pdfStudio/history', () => {
  it('init: sin pasado ni futuro', () => {
    const h = initHistory(1)
    expect(h.present).toBe(1)
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })

  it('push agrega al pasado y deja el presente', () => {
    let h = initHistory(1)
    h = pushHistory(h, 2)
    h = pushHistory(h, 3)
    expect(h.present).toBe(3)
    expect(h.past).toEqual([1, 2])
    expect(canUndo(h)).toBe(true)
  })

  it('push ignora si el estado no cambió (misma ref)', () => {
    const h = initHistory(1)
    expect(pushHistory(h, 1)).toBe(h)
  })

  it('undo/redo navegan y un push nuevo limpia el futuro', () => {
    let h = initHistory(1)
    h = pushHistory(h, 2)
    h = pushHistory(h, 3)
    h = undo(h)
    expect(h.present).toBe(2)
    expect(canRedo(h)).toBe(true)
    h = undo(h)
    expect(h.present).toBe(1)
    h = redo(h)
    expect(h.present).toBe(2)
    h = pushHistory(h, 9)
    expect(h.present).toBe(9)
    expect(canRedo(h)).toBe(false)
  })

  it('undo/redo en los bordes son no-op (misma ref)', () => {
    const h = initHistory(1)
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })

  it('acota el pasado y descarta lo más viejo', () => {
    let h = initHistory(0)
    for (let i = 1; i <= 60; i++) h = pushHistory(h, i)
    expect(h.past.length).toBeLessThanOrEqual(50)
    expect(h.present).toBe(60)
    expect(h.past[0]).toBeGreaterThan(0) // los primeros se descartaron
  })
})
