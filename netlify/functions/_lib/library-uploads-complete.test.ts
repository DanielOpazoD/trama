import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
vi.stubGlobal('Netlify', { env: { get: () => undefined } })

const r2ObjectExistsMock = vi.fn(async () => ({ exists: true, size: 50_000_000 }))
const isR2ConfiguredMock = vi.fn(() => true)
vi.mock('./r2.js', () => ({
  isR2Configured: () => isR2ConfiguredMock(),
  r2ObjectExists: (key: string) => r2ObjectExistsMock(key),
}))

vi.mock('./user-provisioning.js', () => ({ ensureUserRow: vi.fn(async () => {}) }))

import handler from '../library-uploads-complete'

const USER = 'legacy-single-user' // id sin Clerk
const OWNED_KEY = `${USER}/abc123.pdf`

function postComplete(body: unknown) {
  return handler(
    new Request('http://localhost/api/library-uploads-complete', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    mockContext({}),
  )
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    storageKey: OWNED_KEY,
    fileName: 'contrato.pdf',
    mimeType: 'application/pdf',
    byteSize: 50_000_000,
    ...overrides,
  }
}

describe('library-uploads-complete endpoint', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    mockSqlResponses.reset()
    r2ObjectExistsMock.mockClear()
    r2ObjectExistsMock.mockResolvedValue({ exists: true, size: 50_000_000 })
    isR2ConfiguredMock.mockReturnValue(true)
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    mockSqlResponses.reset()
    consoleLogSpy.mockRestore()
  })

  it('rechaza método ≠ POST con 405', async () => {
    const res = await handler(
      new Request('http://localhost/api/library-uploads-complete', { method: 'GET' }),
      mockContext({}),
    )
    expect(res.status).toBe(405)
  })

  it('rechaza una key que no pertenece al usuario con 404', async () => {
    const res = await postComplete(validBody({ storageKey: 'otra-persona/x.pdf' }))
    expect(res.status).toBe(404)
    // No debe consultar R2 ni escribir manifest para una key ajena.
    expect(r2ObjectExistsMock).not.toHaveBeenCalled()
  })

  it('devuelve 404 si el objeto no existe en R2', async () => {
    r2ObjectExistsMock.mockResolvedValueOnce({ exists: false, size: null })
    const res = await postComplete(validBody())
    expect(res.status).toBe(404)
  })

  it('devuelve error claro si R2 no está configurado', async () => {
    isR2ConfiguredMock.mockReturnValue(false)
    const res = await postComplete(validBody())
    expect(res.status).toBe(422)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toContain('R2')
  })

  it('registra el manifest (provider r2) y devuelve el item camelCase', async () => {
    // recordStorageAsset → INSERT RETURNING id; renameLibraryItem → upsert.
    mockSqlResponses.push([{ id: 'asset-r2-1' }])
    mockSqlResponses.push([{ id: 'ov-1', updated_at: '2026-06-22T00:00:00.000Z' }])

    const res = await postComplete(validBody())
    expect(res.status).toBe(201)
    const body = (await res.json()) as { item: Record<string, unknown> }
    expect(body.item).toMatchObject({
      id: 'library-upload:asset-r2-1',
      kind: 'library-upload',
      itemId: 'asset-r2-1',
      title: 'contrato.pdf',
      fileType: 'pdf',
      source: 'subido',
      mimeType: 'application/pdf',
      // tamaño REAL tomado del HEAD de R2 (50 MB), no del hint del cliente.
      byteSize: 50_000_000,
      storageKey: OWNED_KEY,
      storageDomain: 'library-uploads',
    })
    // El item NO expone `provider` (misma forma que el camino multipart).
    expect('provider' in body.item).toBe(false)

    const insert = mockSqlState.calls.find((c) =>
      /INSERT INTO storage_assets/i.test(c.template),
    )
    expect(insert?.values).toEqual(expect.arrayContaining([USER, 'r2', OWNED_KEY]))
  })
})
