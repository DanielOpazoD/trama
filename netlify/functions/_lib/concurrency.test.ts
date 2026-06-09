import { describe, it, expect } from 'vitest'
import { forEachConcurrent } from './concurrency.js'

describe('forEachConcurrent', () => {
  it('procesa todos los ítems exactamente una vez', async () => {
    const items = Array.from({ length: 50 }, (_, i) => i)
    const seen: number[] = []
    await forEachConcurrent(items, 8, async (n) => {
      seen.push(n)
    })
    expect(seen.length).toBe(50)
    expect([...seen].sort((a, b) => a - b)).toEqual(items)
  })

  it('nunca tiene más de `limit` workers en vuelo a la vez', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const items = Array.from({ length: 40 }, (_, i) => i)
    await forEachConcurrent(items, 5, async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
    })
    expect(maxInFlight).toBeLessThanOrEqual(5)
    expect(maxInFlight).toBeGreaterThan(1) // realmente corrió en paralelo
  })

  it('es más rápido que el equivalente secuencial', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    const delay = () => new Promise((r) => setTimeout(r, 5))

    const tConc = Date.now()
    await forEachConcurrent(items, 10, async () => {
      await delay()
    })
    const concurrentMs = Date.now() - tConc

    // 20 ítems × 5ms secuencial ≈ 100ms; con pool de 10 ≈ ~10-20ms.
    expect(concurrentMs).toBeLessThan(80)
  })

  it('maneja lista vacía sin lanzar', async () => {
    let called = 0
    await forEachConcurrent([], 4, async () => {
      called++
    })
    expect(called).toBe(0)
  })

  it('usa pool del tamaño de la lista si es menor que el límite', async () => {
    let maxInFlight = 0
    let inFlight = 0
    await forEachConcurrent([1, 2], 16, async () => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
    })
    expect(maxInFlight).toBeLessThanOrEqual(2)
  })

  it('propaga el error del worker (rechaza la promesa)', async () => {
    await expect(
      forEachConcurrent([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
  })

  it('rechaza un límite menor a 1', async () => {
    await expect(forEachConcurrent([1], 0, async () => {})).rejects.toThrow(/limit/)
  })
})
