import { describe, expect, it } from 'vitest'
import { fuseRanked } from './rrf'

describe('fuseRanked (RRF)', () => {
  it('item que aparece primero en ambas listas gana', () => {
    const a = [
      { id: 'x', item: 'x' },
      { id: 'y', item: 'y' },
    ]
    const b = [
      { id: 'x', item: 'x' },
      { id: 'z', item: 'z' },
    ]
    const fused = fuseRanked([a, b])
    expect(fused[0].id).toBe('x')
  })

  it('preserva items únicos de cada lista pero con menos peso', () => {
    const lex = [
      { id: 'x', item: 'x' },
      { id: 'y', item: 'y' },
    ]
    const sem = [{ id: 'z', item: 'z' }]
    const fused = fuseRanked([lex, sem])
    const ids = fused.map((f) => f.id)
    expect(ids).toContain('x')
    expect(ids).toContain('y')
    expect(ids).toContain('z')
  })

  it('items que aparecen en ambas listas tienen ranks en ambas posiciones', () => {
    const a = [
      { id: 'shared', item: 'shared' },
      { id: 'a-only', item: 'a-only' },
    ]
    const b = [
      { id: 'b-only', item: 'b-only' },
      { id: 'shared', item: 'shared' },
    ]
    const fused = fuseRanked([a, b])
    const shared = fused.find((f) => f.id === 'shared')!
    expect(shared.ranks[0]).toBe(1)
    expect(shared.ranks[1]).toBe(2)
    const aOnly = fused.find((f) => f.id === 'a-only')!
    expect(aOnly.ranks[0]).toBe(2)
    expect(aOnly.ranks[1]).toBe(null)
  })

  it('item presente en ambas listas tiene mejor score que items en una sola', () => {
    const a = [
      { id: 'shared', item: 'shared' },
      { id: 'lex-top', item: 'lex-top' },
    ]
    const b = [
      { id: 'sem-top', item: 'sem-top' },
      { id: 'shared', item: 'shared' },
    ]
    const fused = fuseRanked([a, b])
    // shared aparece en rank 1 (a) y rank 2 (b) → score 1/61 + 1/62
    // lex-top está solo en rank 2 (a) → 1/62
    // sem-top está solo en rank 1 (b) → 1/61
    // shared ≈ 0.0162 + 0.0161 ≈ 0.0323 (mucho más que cualquiera de los solos)
    expect(fused[0].id).toBe('shared')
  })

  it('soporta lista vacía como una de las ramas (degradación graceful)', () => {
    const a = [
      { id: 'x', item: 'x' },
      { id: 'y', item: 'y' },
    ]
    const fused = fuseRanked([a, []])
    expect(fused.map((f) => f.id)).toEqual(['x', 'y'])
  })

  it('k mayor hace que el top-1 domine menos', () => {
    const a = [
      { id: 'x', item: 'x' },
      { id: 'y', item: 'y' },
    ]
    const b = [
      { id: 'y', item: 'y' },
      { id: 'x', item: 'x' },
    ]
    const k60 = fuseRanked([a, b], 60)
    const k1 = fuseRanked([a, b], 1)
    // Ambos quedan empatados en sus scores, pero el orden de "primer aparición"
    // en el Map iteration debería preservarse para tie-breaks.
    expect(k60.length).toBe(2)
    expect(k1.length).toBe(2)
    // Lo importante: con k chico la diferencia entre rank 1 y 2 es más extrema.
    const xScoreK1 = k1.find((f) => f.id === 'x')!.score
    const xScoreK60 = k60.find((f) => f.id === 'x')!.score
    expect(xScoreK1).toBeGreaterThan(xScoreK60)
  })
})
