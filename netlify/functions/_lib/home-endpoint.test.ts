import { describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../home'

describe('home endpoint', () => {
  it('devuelve portada liviana sin descargar tablas completas', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([], [], [], [{ entities: 2, quotes: 1, relationships: 1 }])

    const res = await handler(new Request('http://localhost/api/home'), mockContext())

    expect(res.status).toBe(200)
    const templates = mockSqlResponses.calls.map((call) => call.template)
    expect(templates).toHaveLength(4)
    expect(templates.join('\n')).toMatch(/LIMIT/)
    const body = await res.json()
    expect(body.counts).toEqual({ entities: 2, quotes: 1, relationships: 1 })
  })
})
