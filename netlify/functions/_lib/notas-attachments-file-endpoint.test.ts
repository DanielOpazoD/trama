import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const { getWithMetadata } = vi.hoisted(() => ({
  getWithMetadata: vi.fn(async () => ({
    data: new Uint8Array([1, 2, 3]).buffer,
    metadata: {},
  })),
}))

vi.mock('@netlify/blobs', () => ({
  getStore: () => ({ getWithMetadata }),
}))

import handler from '../notas-attachments-file'

/**
 * Único handler de los 72 que faltaba cubrir directamente, y tiene authz real:
 * sirve un blob solo si el storageKey está namespaced bajo el userId del que
 * pide Y existe la fila en notas_attachments (user_id + deleted_at IS NULL).
 * Blindamos el caso cross-user (no debe filtrar ni tocar la DB/blob) y el happy
 * path (query scoped por user_id + headers privados).
 */
describe('notas-attachments-file endpoint', () => {
  const originalClerkSecret = process.env['CLERK_SECRET_KEY']
  const originalFallback = process.env['ALLOW_LEGACY_FALLBACK']
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockSqlResponses.reset()
    getWithMetadata.mockClear()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    // Sin Clerk → getAuthedUser() resuelve al usuario legacy-single-user.
    delete process.env['CLERK_SECRET_KEY']
    delete process.env['ALLOW_LEGACY_FALLBACK']
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    if (originalClerkSecret === undefined) delete process.env['CLERK_SECRET_KEY']
    else process.env['CLERK_SECRET_KEY'] = originalClerkSecret
    if (originalFallback === undefined) delete process.env['ALLOW_LEGACY_FALLBACK']
    else process.env['ALLOW_LEGACY_FALLBACK'] = originalFallback
    vi.unstubAllGlobals()
  })

  it('niega un key de otro usuario con 404 y SIN tocar la DB ni el blob aunque exista', async () => {
    getWithMetadata.mockResolvedValueOnce({
      data: new Uint8Array([9, 9, 9]).buffer,
      metadata: { mime: 'image/jpeg' },
    })
    // storageKey = 'otro-user/foto.jpg', pero el autenticado es legacy-single-user.
    const res = await handler(
      new Request('http://localhost/api/notas-attachments-file/otro-user/foto.jpg'),
      mockContext({ userId: 'otro-user', key: 'foto.jpg' }),
    )

    expect(res.status).toBe(404)
    // El rechazo ocurre por el prefijo del key: NUNCA se consulta notas_attachments
    // ni se lee el blob (la única SQL que puede haber es el error_log del wrapper).
    expect(
      mockSqlState.calls.some((c) => /FROM notas_attachments/i.test(c.template)),
    ).toBe(false)
    expect(getWithMetadata).not.toHaveBeenCalled()
    const events = consoleLogSpy.mock.calls.map((call) => JSON.parse(call[0] as string))
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'blob.access.denied',
          category: 'operational',
          severity: 'warn',
          operation: 'attachment.blob.read',
          userId: 'legacy-single-user',
        }),
      ]),
    )
  })

  it('sirve el blob del dueño con la query scoped por user_id y headers privados', async () => {
    mockSqlResponses.push([{ file_name: 'foto.jpg', mime_type: 'image/jpeg' }])

    const res = await handler(
      new Request(
        'http://localhost/api/notas-attachments-file/legacy-single-user/foto.jpg',
      ),
      mockContext({ userId: 'legacy-single-user', key: 'foto.jpg' }),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('image/jpeg')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('Vary')).toContain('Authorization')
    expect(getWithMetadata).toHaveBeenCalledWith('legacy-single-user/foto.jpg', {
      type: 'arrayBuffer',
    })

    // La consulta scopa por storage_key + user_id (sin esto, sería un IDOR).
    const q = mockSqlState.calls.find((c) => /FROM notas_attachments/i.test(c.template))
    expect(q).toBeDefined()
    expect(q?.template).toMatch(/user_id =/i)
    expect(q?.template).toMatch(/storage_key =/i)
    expect(q?.values).toEqual(
      expect.arrayContaining(['legacy-single-user/foto.jpg', 'legacy-single-user']),
    )
  })
})
