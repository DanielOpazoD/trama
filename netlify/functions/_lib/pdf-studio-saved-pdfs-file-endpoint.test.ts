import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const { getWithMetadata } = vi.hoisted(() => ({
  getWithMetadata: vi.fn(async () => ({
    data: new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer,
    metadata: {},
  })),
}))

vi.mock('@netlify/blobs', () => ({
  getStore: () => ({ getWithMetadata }),
}))

import handler from '../pdf-studio-saved-pdfs-file'

/**
 * Espejo de `notas-attachments-file`: sirve el PDF solo si el key está
 * namespaced bajo el usuario que pide Y existe la fila viva en
 * pdf_studio_saved_pdfs. Cross-user → 404 sin tocar DB ni blob.
 */
describe('pdf-studio-saved-pdfs-file endpoint', () => {
  const originalClerkSecret = process.env['CLERK_SECRET_KEY']
  const originalFallback = process.env['ALLOW_LEGACY_FALLBACK']
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockSqlResponses.reset()
    getWithMetadata.mockClear()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
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

  it('niega un key de otro usuario con 404 sin consultar la tabla ni el blob', async () => {
    const res = await handler(
      new Request('http://localhost/api/pdf-studio-saved-pdfs-file/otro-user/abc.pdf'),
      mockContext({ userId: 'otro-user', key: 'abc.pdf' }),
    )

    expect(res.status).toBe(404)
    expect(
      mockSqlState.calls.some((c) => /FROM pdf_studio_saved_pdfs/i.test(c.template)),
    ).toBe(false)
    expect(getWithMetadata).not.toHaveBeenCalled()
    const events = consoleLogSpy.mock.calls.map((call) => JSON.parse(call[0] as string))
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'blob.access.denied',
          severity: 'warn',
          operation: 'pdf-studio-saved-pdf.blob.read',
          reason: 'storage_key_owner_mismatch',
        }),
      ]),
    )
  })

  it('un key propio sin fila viva también es 404 y no lee el blob', async () => {
    mockSqlResponses.push([])
    const res = await handler(
      new Request(
        'http://localhost/api/pdf-studio-saved-pdfs-file/legacy-single-user/abc.pdf',
      ),
      mockContext({ userId: 'legacy-single-user', key: 'abc.pdf' }),
    )
    expect(res.status).toBe(404)
    expect(getWithMetadata).not.toHaveBeenCalled()
  })

  it('sirve el PDF del dueño con la query scoped por user_id y nombre de archivo limpio', async () => {
    mockSqlResponses.push([{ name: 'Carta "urgente"', mime_type: 'application/pdf' }])

    const res = await handler(
      new Request(
        'http://localhost/api/pdf-studio-saved-pdfs-file/legacy-single-user/abc.pdf',
      ),
      mockContext({ userId: 'legacy-single-user', key: 'abc.pdf' }),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="Carta urgente.pdf"',
    )
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable')
    expect(res.headers.get('Vary')).toContain('Authorization')
    expect(getWithMetadata).toHaveBeenCalledWith('legacy-single-user/abc.pdf', {
      type: 'arrayBuffer',
    })

    const q = mockSqlState.calls.find((c) =>
      /FROM pdf_studio_saved_pdfs/i.test(c.template),
    )
    expect(q?.template).toMatch(/user_id =/i)
    expect(q?.template).toMatch(/storage_key =/i)
    expect(q?.template).toMatch(/deleted_at IS NULL/i)
    expect(q?.values).toEqual(
      expect.arrayContaining(['legacy-single-user/abc.pdf', 'legacy-single-user']),
    )
  })
})
