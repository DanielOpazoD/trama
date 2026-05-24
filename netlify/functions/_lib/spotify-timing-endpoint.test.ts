import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../spotify-timing'

describe('spotify-timing endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GET devuelve array de timestamps ISO ordenados', async () => {
    mockSqlResponses.push([
      { played_at: '2026-05-20T10:00:00Z' },
      { played_at: '2026-05-21T15:30:00Z' },
      { played_at: '2026-05-22T08:00:00Z' },
    ])
    const res = await handler(
      new Request('http://localhost/api/spotify/timing?since=2026-05-01T00:00:00Z'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      since: string
      playedAts: string[]
      truncated: boolean
    }
    expect(body.playedAts).toEqual([
      '2026-05-20T10:00:00Z',
      '2026-05-21T15:30:00Z',
      '2026-05-22T08:00:00Z',
    ])
    expect(body.truncated).toBe(false)
  })

  it('normaliza played_at de Date a ISO string si Neon devuelve Date', async () => {
    mockSqlResponses.push([
      { played_at: new Date('2026-05-20T10:00:00Z') },
    ])
    const res = await handler(
      new Request('http://localhost/api/spotify/timing'),
      mockContext(),
    )
    const body = (await res.json()) as { playedAts: string[] }
    expect(body.playedAts[0]).toBe('2026-05-20T10:00:00.000Z')
  })

  it('devuelve playedAts vacío cuando no hay plays en el período', async () => {
    mockSqlResponses.push([])
    const res = await handler(
      new Request('http://localhost/api/spotify/timing'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { playedAts: string[] }
    expect(body.playedAts).toEqual([])
  })

  it('rechaza método no GET con 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/spotify/timing', { method: 'POST' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })

  it('si se omite ?since, el endpoint usa default de 90 días', async () => {
    mockSqlResponses.push([])
    const res = await handler(
      new Request('http://localhost/api/spotify/timing'),
      mockContext(),
    )
    const body = (await res.json()) as { since: string }
    // Verificamos que el since está en el pasado y aproximadamente a 90 días.
    const sinceMs = new Date(body.since).getTime()
    const ninetyDaysAgo = Date.now() - 90 * 86_400_000
    // Tolerancia de ±5s para clock variability entre `Date.now()` calls.
    expect(Math.abs(sinceMs - ninetyDaysAgo)).toBeLessThan(5000)
  })
})
