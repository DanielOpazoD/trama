import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../user-prefs'

describe('user-prefs endpoint — integration', () => {
  beforeEach(() => mockSqlResponses.reset())
  afterEach(() => vi.unstubAllGlobals())

  it('GET devuelve las prefs del usuario', async () => {
    mockSqlResponses.push([
      { prefs: { defaultWorld: 'notas', visibleModules: { claves: false } } },
    ])
    const res = await handler(
      new Request('http://localhost/api/user-prefs'),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      defaultWorld: 'notas',
      visibleModules: { claves: false },
    })
  })

  it('GET sin fila devuelve {}', async () => {
    mockSqlResponses.push([])
    const res = await handler(
      new Request('http://localhost/api/user-prefs'),
      mockContext(),
    )
    expect(await res.json()).toEqual({})
  })

  it('PUT hace merge superficial (jsonb ||) y devuelve las prefs', async () => {
    mockSqlResponses.push(
      [], // ensureUserRow
      [{ prefs: { defaultWorld: 'notas', visibleModules: { claves: false } } }],
    )
    const res = await handler(
      new Request('http://localhost/api/user-prefs', {
        method: 'PUT',
        body: JSON.stringify({ defaultWorld: 'notas' }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      defaultWorld: 'notas',
      visibleModules: { claves: false },
    })
    const upsert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO user_prefs/i.test(c.template),
    )
    expect(upsert?.template).toMatch(/ON CONFLICT/i)
    expect(upsert?.template).toMatch(/\|\|/) // merge superficial
  })

  it('PUT con clave desconocida devuelve 400 (zod strict)', async () => {
    const res = await handler(
      new Request('http://localhost/api/user-prefs', {
        method: 'PUT',
        body: JSON.stringify({ bogus: 1 }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(400)
  })

  it('PUT acepta correctamente propiedades de personalización nuevas', async () => {
    mockSqlResponses.push(
      [], // ensureUserRow
      [
        {
          prefs: {
            visibleSections: { index: true },
            pinnedSections: { notas: true },
            sectionAliases: { index: 'mi alias' },
          },
        },
      ],
    )
    const res = await handler(
      new Request('http://localhost/api/user-prefs', {
        method: 'PUT',
        body: JSON.stringify({
          visibleSections: { index: true },
          pinnedSections: { notas: true },
          sectionAliases: { index: 'mi alias' },
        }),
      }),
      mockContext(),
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      visibleSections: { index: true },
      pinnedSections: { notas: true },
      sectionAliases: { index: 'mi alias' },
    })
  })

  it('método no soportado devuelve 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/user-prefs', { method: 'DELETE' }),
      mockContext(),
    )
    expect(res.status).toBe(405)
  })
})
