import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../notas-attachments'

describe('notas attachments endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
  })

  it('no lista anexos si la nota dueña ya no existe para el usuario actual', async () => {
    mockSqlResponses.push([{ exists: false }])

    const res = await handler(
      new Request('http://localhost/api/notas-attachments?ownerType=note&ownerId=n1'),
      mockContext(),
    )

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } })
    expect(mockSqlState.calls[0]?.template).toMatch(/FROM notes/)
    expect(mockSqlState.calls[0]?.template).toMatch(/deleted_at IS NULL/)
    expect(mockSqlState.calls[0]?.values).toContain('legacy-single-user')
    expect(
      mockSqlState.calls.some((call) => /FROM notas_attachments/i.test(call.template)),
    ).toBe(false)
  })

  it('lista anexos solo cuando el prompt dueño sigue activo y pertenece al usuario', async () => {
    mockSqlResponses.push([{ exists: true }])
    mockSqlResponses.push([
      {
        id: 'a1',
        owner_type: 'prompt',
        owner_id: 'p1',
        file_name: 'brief.md',
        mime_type: 'text/markdown',
        byte_size: 42,
        storage_key: 'legacy-single-user/brief.md',
        created_at: '2026-06-01T00:00:00.000Z',
        updated_at: '2026-06-01T00:00:00.000Z',
      },
    ])

    const res = await handler(
      new Request('http://localhost/api/notas-attachments?ownerType=prompt&ownerId=p1'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toHaveLength(1)
    expect(mockSqlState.calls[0]?.template).toMatch(/FROM prompts/)
    expect(mockSqlState.calls[1]?.template).toMatch(/FROM notas_attachments/)
    expect(mockSqlState.calls[1]?.values).toContain('legacy-single-user')
  })
})
