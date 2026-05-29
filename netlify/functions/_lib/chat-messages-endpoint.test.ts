import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
vi.stubGlobal('Netlify', {
  env: {
    get: vi.fn((key: string) => (key === 'ALLOW_LEGACY_FALLBACK' ? 'true' : undefined)),
  },
})
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => '',
    json: async () => ({}),
  }),
)

import handler from '../chat-messages'

/**
 * BB6 / tarea #282: contrato de `chat-messages.mts`. Cubrimos las branches
 * de validación + el mapeo de la respuesta GET, sin entrar al stream SSE
 * (que requiere LLM real):
 *   - sin threadId en params → 400 (chequeo antes de auth)
 *   - método ≠ GET/POST → 405
 *   - body sin `content` → 400 VALIDATION
 *   - content whitespace puro → 400 VALIDATION
 *   - GET → 200 con created_at → createdAt (transform snake→camel)
 */
describe('chat-messages endpoint — contrato', () => {
  beforeEach(() => mockSqlResponses.reset())
  afterEach(() => mockSqlResponses.reset())

  it('devuelve 400 si falta el threadId en params', async () => {
    const res = await handler(
      new Request('http://localhost/api/chat/threads//messages', {
        method: 'POST',
        body: '{}',
      }),
      mockContext({}),
    )
    expect(res.status).toBe(400)
  })

  it('rechaza método ≠ GET/POST con 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/chat/threads/t1/messages', { method: 'PUT' }),
      mockContext({ threadId: 't1' }),
    )
    expect(res.status).toBe(405)
  })

  it('devuelve 400 VALIDATION si el body no trae content', async () => {
    const res = await handler(
      new Request('http://localhost/api/chat/threads/t1/messages', {
        method: 'POST',
        body: '{}',
      }),
      mockContext({ threadId: 't1' }),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('VALIDATION')
  })

  it('devuelve 400 si content es whitespace puro', async () => {
    const res = await handler(
      new Request('http://localhost/api/chat/threads/t1/messages', {
        method: 'POST',
        body: JSON.stringify({ content: '   ' }),
      }),
      mockContext({ threadId: 't1' }),
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('VALIDATION')
    expect(body.error.message).toMatch(/content/i)
  })

  it('GET devuelve los mensajes mapeando created_at → createdAt', async () => {
    mockSqlResponses.push([
      {
        id: 'm1',
        role: 'user',
        content: 'hola',
        proposal: null,
        created_at: '2026-05-01T10:00:00Z',
        provider: null,
        model: null,
      },
    ])

    const res = await handler(
      new Request('http://localhost/api/chat/threads/t1/messages', { method: 'GET' }),
      mockContext({ threadId: 't1' }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Array<{
      id: string
      createdAt: string
      provider?: string
    }>
    expect(body).toHaveLength(1)
    expect(body[0]!.id).toBe('m1')
    expect(body[0]!.createdAt).toBe('2026-05-01T10:00:00Z')
    // provider null → undefined en la respuesta.
    expect(body[0]!.provider).toBeUndefined()
  })
})
