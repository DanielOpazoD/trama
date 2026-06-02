import { describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn().mockResolvedValue({ sub: 'user_notas_premium_a' }),
}))

process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'
process.env['ALLOW_LEGACY_FALLBACK'] = 'false'

import promptsHandler from '../prompts'
import secretsHandler from '../secrets'
import attachmentsHandler from '../notas-attachments'
import exportHandler from '../export'

const encryptedEnvelope =
  '{"v":1,"alg":"AES-GCM","iv":"AAAAAAAAAAAAAAAA","data":"BBBBBBBBBBBBBBBB"}'

function authedRequest(url: string, init: RequestInit = {}) {
  return new Request(url, {
    ...init,
    headers: {
      authorization: 'Bearer test-token',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
}

describe('notas premium isolation', () => {
  it('prompts GET y mutaciones siempre filtran por el usuario autenticado', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([])
    await promptsHandler(authedRequest('http://localhost/api/prompts'), mockContext())

    mockSqlResponses.push([])
    await promptsHandler(
      authedRequest('http://localhost/api/prompts/p-other/use', { method: 'POST' }),
      mockContext({ id: 'p-other' }),
    )

    for (const call of mockSqlState.calls.filter((c) =>
      /FROM prompts|UPDATE prompts/i.test(c.template),
    )) {
      expect(call.template).toMatch(/user_id/)
      expect(call.values).toContain('user_notas_premium_a')
    }
  })

  it('secrets reveal/copy/update/delete quedan scoped al usuario autenticado', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([], [], [], [])

    await secretsHandler(
      authedRequest('http://localhost/api/secrets/s-other/reveal'),
      mockContext({ id: 's-other' }),
    )
    await secretsHandler(
      authedRequest('http://localhost/api/secrets/s-other/copied', { method: 'POST' }),
      mockContext({ id: 's-other' }),
    )
    await secretsHandler(
      authedRequest('http://localhost/api/secrets/s-other', {
        method: 'PATCH',
        body: JSON.stringify({ favorite: true }),
      }),
      mockContext({ id: 's-other' }),
    )
    await secretsHandler(
      authedRequest('http://localhost/api/secrets/s-other', { method: 'DELETE' }),
      mockContext({ id: 's-other' }),
    )

    for (const call of mockSqlState.calls.filter((c) =>
      /FROM secrets|UPDATE secrets/i.test(c.template),
    )) {
      expect(call.template).toMatch(/user_id/)
      expect(call.values).toContain('user_notas_premium_a')
    }
  })

  it('attachments no lista anexos sin validar dueño activo del mismo usuario', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push([{ exists: true }], [])

    await attachmentsHandler(
      authedRequest('http://localhost/api/notas-attachments?ownerType=prompt&ownerId=p1'),
      mockContext(),
    )

    expect(mockSqlState.calls[0]?.template).toMatch(/FROM prompts/)
    expect(mockSqlState.calls[0]?.values).toContain('user_notas_premium_a')
    expect(mockSqlState.calls[1]?.template).toMatch(/FROM notas_attachments/)
    expect(mockSqlState.calls[1]?.values).toContain('user_notas_premium_a')
  })

  it('export consulta prompts, claves y anexos con RLS/user_id del usuario actual', async () => {
    mockSqlResponses.reset()
    mockSqlResponses.push(
      [{ set_config: 'user_notas_premium_a' }],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [
        {
          id: 'p1',
          title: 'Prompt A',
          content: 'Contenido',
          collection: null,
          tags: [],
          variables: [],
          favorite: false,
          use_count: 0,
          last_used_at: null,
          origin: { kind: 'manual' },
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ],
      [
        {
          id: 's1',
          label: 'Clave A',
          secret_value: encryptedEnvelope,
          kind: 'api_key',
          service: null,
          username: null,
          notes: null,
          favorite: false,
          critical: false,
          expires_at: null,
          last_rotated_at: null,
          copied_at: null,
          origin: { kind: 'manual' },
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: '2026-06-01T00:00:00.000Z',
        },
      ],
      [],
    )

    const res = await exportHandler(
      authedRequest('http://localhost/api/export'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.prompts).toHaveLength(1)
    expect(body.secrets).toHaveLength(1)
    for (const call of mockSqlState.calls.filter((c) =>
      /FROM (prompts|secrets|notas_attachments)/i.test(c.template),
    )) {
      expect(call.template).toMatch(/user_id/)
      expect(call.values).toContain('user_notas_premium_a')
    }
  })
})
