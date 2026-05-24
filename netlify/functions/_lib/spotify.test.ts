import { describe, it, expect } from 'vitest'
import { aggregateDecades, aggregateTopGenres } from './spotify'

describe('aggregateTopGenres', () => {
  it('pondera géneros por popularity y devuelve top-N ordenado', () => {
    const artists = [
      { genres: ['indie pop', 'dream pop'], popularity: 80 },
      { genres: ['indie pop'], popularity: 60 },
      { genres: ['jazz'], popularity: 40 },
    ]
    const result = aggregateTopGenres(artists, 5)
    expect(result[0].name).toBe('indie pop') // 80 + 60 = 140 (highest)
    expect(result[0].weight).toBe(140)
    expect(result.find((g) => g.name === 'dream pop')?.weight).toBe(80)
    expect(result.find((g) => g.name === 'jazz')?.weight).toBe(40)
  })

  it('normaliza el case de los géneros (lowercase)', () => {
    const artists = [
      { genres: ['Indie Pop'], popularity: 50 },
      { genres: ['indie pop'], popularity: 50 },
    ]
    const result = aggregateTopGenres(artists)
    // Debe haber UN solo "indie pop", con peso 100.
    const indiePop = result.filter((g) => g.name === 'indie pop')
    expect(indiePop).toHaveLength(1)
    expect(indiePop[0].weight).toBe(100)
  })

  it('artistas sin popularity reciben peso mínimo 1', () => {
    const artists = [{ genres: ['post-rock'], popularity: 0 }]
    const result = aggregateTopGenres(artists)
    expect(result[0]).toEqual({ name: 'post-rock', weight: 1 })
  })

  it('respeta el límite topN', () => {
    const artists = [
      { genres: ['g1'], popularity: 9 },
      { genres: ['g2'], popularity: 8 },
      { genres: ['g3'], popularity: 7 },
      { genres: ['g4'], popularity: 6 },
    ]
    const result = aggregateTopGenres(artists, 2)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('g1')
    expect(result[1].name).toBe('g2')
  })

  it('devuelve array vacío si no hay géneros', () => {
    const result = aggregateTopGenres([{ genres: [], popularity: 50 }])
    expect(result).toEqual([])
  })
})

describe('aggregateDecades', () => {
  it('agrupa por década y ordena cronológicamente', () => {
    const tracks = [
      { releaseYear: 1995 },
      { releaseYear: 1999 },
      { releaseYear: 2003 },
      { releaseYear: 2015 },
      { releaseYear: 2018 },
      { releaseYear: 2022 },
    ]
    const result = aggregateDecades(tracks)
    expect(result).toEqual([
      { decade: '1990s', count: 2 },
      { decade: '2000s', count: 1 },
      { decade: '2010s', count: 2 },
      { decade: '2020s', count: 1 },
    ])
  })

  it('ignora tracks sin releaseYear', () => {
    const result = aggregateDecades([
      { releaseYear: 2000 },
      { releaseYear: null },
      { releaseYear: 2001 },
    ])
    expect(result).toEqual([{ decade: '2000s', count: 2 }])
  })

  it('devuelve array vacío si no hay datos', () => {
    expect(aggregateDecades([])).toEqual([])
  })
})
