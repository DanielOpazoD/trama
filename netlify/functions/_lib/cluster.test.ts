import { describe, it, expect } from 'vitest'
import { normalize, chooseK, kmeans } from './cluster'

describe('normalize', () => {
  it('escala a norma 1', () => {
    const v = normalize([3, 4])
    expect(v[0]).toBeCloseTo(0.6)
    expect(v[1]).toBeCloseTo(0.8)
    const mag = Math.sqrt(v[0]! ** 2 + v[1]! ** 2)
    expect(mag).toBeCloseTo(1)
  })

  it('deja el vector cero intacto (sin dividir por 0)', () => {
    expect(normalize([0, 0])).toEqual([0, 0])
  })
})

describe('chooseK', () => {
  it('nunca menos de 2 (salvo n<2)', () => {
    expect(chooseK(0)).toBe(1)
    expect(chooseK(1)).toBe(1)
    expect(chooseK(2)).toBe(2)
    expect(chooseK(6)).toBe(2)
  })

  it('crece ~√(n/2) y se acota a 10', () => {
    expect(chooseK(50)).toBe(5)
    expect(chooseK(200)).toBe(10)
    expect(chooseK(2000)).toBe(10)
  })

  it('nunca más clusters que puntos', () => {
    expect(chooseK(3)).toBeLessThanOrEqual(3)
  })
})

describe('kmeans', () => {
  it('separa dos nubes bien distantes en 2 clusters', () => {
    // Dos grupos: alrededor de (0,0) y de (10,10).
    const points = [
      [0, 0],
      [0.1, -0.1],
      [-0.1, 0.2],
      [10, 10],
      [10.2, 9.8],
      [9.9, 10.1],
    ]
    const assign = kmeans(points, 2)
    // Los tres primeros comparten cluster; los tres últimos, otro.
    expect(assign[0]).toBe(assign[1])
    expect(assign[1]).toBe(assign[2])
    expect(assign[3]).toBe(assign[4])
    expect(assign[4]).toBe(assign[5])
    expect(assign[0]).not.toBe(assign[3])
  })

  it('es determinista — misma entrada, misma salida', () => {
    const points = [
      [0, 0],
      [5, 5],
      [0.2, 0.1],
      [5.1, 4.9],
      [-0.1, 0.3],
    ]
    const a = kmeans(points, 2)
    const b = kmeans(points, 2)
    expect(a).toEqual(b)
  })

  it('maneja k mayor que la cantidad de puntos', () => {
    const assign = kmeans(
      [
        [1, 1],
        [2, 2],
      ],
      5,
    )
    expect(assign).toHaveLength(2)
  })

  it('devuelve [] para entrada vacía', () => {
    expect(kmeans([], 3)).toEqual([])
  })
})
