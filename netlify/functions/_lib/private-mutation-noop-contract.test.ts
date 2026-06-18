import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => '',
    json: async () => ({}),
  }),
)

const verifyTokenMock = vi.hoisted(() => vi.fn())
vi.mock('@clerk/backend', () => ({
  verifyToken: verifyTokenMock,
  createClerkClient: () => ({
    users: { getUser: vi.fn().mockRejectedValue(new Error('not found')) },
  }),
}))

process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'

import entitiesHandler from '../entities'
import momentosShareInvitationsHandler from '../momentos-share-invitations'
import momentosShareAccessHandler from '../momentos-share-access'
import momentosHandler from '../momentos'
import notesHandler from '../notes'
import notasAttachmentsHandler from '../notas-attachments'
import quotesHandler from '../quotes'

function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('private mutation no-op contract', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    verifyTokenMock.mockReset()
    verifyTokenMock.mockResolvedValue({
      sub: 'user_a',
      email: 'a@example.com',
    })
  })

  const cases = [
    {
      name: 'entities PATCH',
      handler: entitiesHandler,
      request: () =>
        jsonRequest('http://localhost/api/entities/e1', 'PATCH', { position_x: 12 }),
      context: () => mockContext({ id: 'e1' }),
      sqlRows: () => [[]],
    },
    {
      name: 'entities DELETE',
      handler: entitiesHandler,
      request: () => jsonRequest('http://localhost/api/entities/e1', 'DELETE'),
      context: () => mockContext({ id: 'e1' }),
      sqlRows: () => [[]],
    },
    {
      name: 'entities restore',
      handler: entitiesHandler,
      request: () =>
        jsonRequest('http://localhost/api/entities/e1/restore', 'POST', {
          deletedAt: '2026-06-10T00:00:00Z',
        }),
      context: () => mockContext({ id: 'e1' }),
      sqlRows: () => [[{ restored: false }]],
    },
    {
      name: 'quotes DELETE',
      handler: quotesHandler,
      request: () => jsonRequest('http://localhost/api/quotes/q1', 'DELETE'),
      context: () => mockContext({ id: 'q1' }),
      sqlRows: () => [[], []],
    },
    {
      name: 'quotes restore',
      handler: quotesHandler,
      request: () =>
        jsonRequest('http://localhost/api/quotes/q1/restore', 'POST', {
          deletedAt: '2026-06-10T00:00:00Z',
        }),
      context: () => mockContext({ id: 'q1' }),
      sqlRows: () => [[], []],
    },
    {
      name: 'notes promote',
      handler: notesHandler,
      request: () => jsonRequest('http://localhost/api/notes/n1/promote', 'POST'),
      context: () => mockContext({ id: 'n1' }),
      sqlRows: () => [[]],
    },
    {
      name: 'notes PATCH',
      handler: notesHandler,
      request: () =>
        jsonRequest('http://localhost/api/notes/n1', 'PATCH', {
          content: 'updated',
        }),
      context: () => mockContext({ id: 'n1' }),
      sqlRows: () => [[]],
    },
    {
      name: 'notes DELETE',
      handler: notesHandler,
      request: () => jsonRequest('http://localhost/api/notes/n1', 'DELETE'),
      context: () => mockContext({ id: 'n1' }),
      sqlRows: () => [[]],
    },
    {
      name: 'notes restore',
      handler: notesHandler,
      request: () =>
        jsonRequest('http://localhost/api/notes/n1/restore', 'POST', {
          deletedAt: '2026-06-10T00:00:00Z',
        }),
      context: () => mockContext({ id: 'n1' }),
      sqlRows: () => [[{ restored: false }]],
    },
    {
      name: 'momentos DELETE',
      handler: momentosHandler,
      request: () => jsonRequest('http://localhost/api/momentos/m1', 'DELETE'),
      context: () => mockContext({ id: 'm1' }),
      sqlRows: () => [[]],
    },
    {
      name: 'notas attachments DELETE',
      handler: notasAttachmentsHandler,
      request: () => jsonRequest('http://localhost/api/notas-attachments/a1', 'DELETE'),
      context: () => mockContext({ id: 'a1' }),
      sqlRows: () => [[]],
    },
    {
      name: 'momentos share access DELETE',
      handler: momentosShareAccessHandler,
      request: () =>
        jsonRequest('http://localhost/api/momentos-share-access/user_b', 'DELETE'),
      context: () => mockContext({ userId: 'user_b' }),
      sqlRows: () => [[], [{ revoked: false }]],
    },
    {
      name: 'momentos share invitation accept',
      handler: momentosShareInvitationsHandler,
      request: () =>
        jsonRequest('http://localhost/api/momentos-share-invitations/inv1', 'PATCH', {
          action: 'accept',
        }),
      context: () => mockContext({ id: 'inv1' }),
      sqlRows: () => [[], []],
    },
    {
      name: 'momentos share invitation reject',
      handler: momentosShareInvitationsHandler,
      request: () =>
        jsonRequest('http://localhost/api/momentos-share-invitations/inv1', 'PATCH', {
          action: 'reject',
        }),
      context: () => mockContext({ id: 'inv1' }),
      sqlRows: () => [[], []],
    },
  ]

  it.each(cases)('$name devuelve 404 cuando la mutación no toca filas', async (item) => {
    mockSqlResponses.push(...item.sqlRows())

    const response = await item.handler(item.request(), item.context())

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'NOT_FOUND' },
    })
  })
})
