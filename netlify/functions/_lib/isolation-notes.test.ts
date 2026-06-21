import { describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn().mockResolvedValue({ sub: 'user_notes_xyz' }),
  createClerkClient: () => ({
    users: { getUser: vi.fn().mockRejectedValue(new Error('not found')) },
  }),
}))

process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'

import handler from '../notes'

function requestWithToken(method = 'GET', body?: unknown) {
  const init: RequestInit = {
    method,
    headers: { authorization: 'Bearer xyz-token' },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  return new Request('http://localhost/api/notes', init)
}

describe('isolation cross-user — notes endpoint', () => {
  it('POST crea nota escribiendo user_id explícito del usuario autenticado', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([
      {
        id: 'note-1',
        content: 'nota privada',
        title: null,
        tags: [],
        pinned: false,
        promoted_momento_id: null,
        source: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        has_images: false,
        has_audio: false,
      },
    ])

    const res = await handler(
      requestWithToken('POST', { content: 'nota privada' }),
      mockContext(),
    )

    expect(res.status).toBe(201)
    const insert = mockSqlState.calls.find((call) =>
      /INSERT INTO notes/i.test(call.template),
    )
    expect(insert?.template).toMatch(/\(content, title, tags, pinned, user_id\)/i)
    expect(insert?.values).toContain('user_notes_xyz')
  })
})
