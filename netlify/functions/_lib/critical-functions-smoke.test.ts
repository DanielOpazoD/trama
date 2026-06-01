import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const clerkMocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
}))
vi.mock('@clerk/backend', () => ({
  verifyToken: clerkMocks.verifyToken,
}))

const blobMocks = vi.hoisted(() => ({
  set: vi.fn(async () => {}),
  getWithMetadata: vi.fn(async () => ({
    data: new Uint8Array([7, 8, 9]).buffer,
    metadata: { mime: 'image/png' },
  })),
}))
vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(() => ({
    set: blobMocks.set,
    getWithMetadata: blobMocks.getWithMetadata,
  })),
}))

const aiMocks = vi.hoisted(() => ({
  checkMonthlyBudget: vi.fn(),
  askLLMForJson: vi.fn(),
}))
vi.mock('./cost-cap.js', () => ({
  checkMonthlyBudget: aiMocks.checkMonthlyBudget,
}))
vi.mock('./llm.js', () => ({
  askLLMForJson: aiMocks.askLLMForJson,
}))
vi.mock('./ai-mode.js', () => ({
  resolveAIInvocation: vi.fn(async () => ({
    kind: 'ready',
    provider: 'openai',
    model: 'gpt-smoke',
    verifyWith: null,
  })),
  aiOffResponse: vi.fn((requestId: string) =>
    Response.json(
      { error: { code: 'AI_DISABLED', message: 'IA deshabilitada', requestId } },
      { status: 423 },
    ),
  ),
}))

import exportHandler from '../export'
import importHandler from '../import'
import extractHandler from '../extract'
import uploadHandler from '../momentos-upload'
import fileHandler from '../momentos-file'

function formWithFile(file: File) {
  const form = new FormData()
  form.set('file', file)
  return form
}

describe('critical functions smoke', () => {
  const originalClerkSecret = process.env['CLERK_SECRET_KEY']
  const originalFallback = process.env['ALLOW_LEGACY_FALLBACK']

  beforeEach(() => {
    mockSqlResponses.reset()
    clerkMocks.verifyToken.mockReset()
    blobMocks.set.mockClear()
    blobMocks.getWithMetadata.mockClear()
    aiMocks.checkMonthlyBudget.mockReset()
    aiMocks.checkMonthlyBudget.mockResolvedValue(null)
    aiMocks.askLLMForJson.mockReset()
    delete process.env['CLERK_SECRET_KEY']
    delete process.env['ALLOW_LEGACY_FALLBACK']
  })

  afterEach(() => {
    if (originalClerkSecret === undefined) delete process.env['CLERK_SECRET_KEY']
    else process.env['CLERK_SECRET_KEY'] = originalClerkSecret
    if (originalFallback === undefined) delete process.env['ALLOW_LEGACY_FALLBACK']
    else process.env['ALLOW_LEGACY_FALLBACK'] = originalFallback
  })

  it('auth estricto rechaza sin token antes de exportar datos', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_smoke'
    process.env['ALLOW_LEGACY_FALLBACK'] = 'false'

    const res = await exportHandler(
      new Request('http://localhost/api/export'),
      mockContext(),
    )

    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })
  })

  it('export/import mantienen el scope parcial legado visible', async () => {
    mockSqlResponses.push([], [], [])
    const exported = await exportHandler(
      new Request('http://localhost/api/export'),
      mockContext(),
    )

    expect(exported.status).toBe(200)
    expect(await exported.json()).toMatchObject({
      scope: {
        kind: 'legacy-partial',
        includes: ['entities', 'relationships', 'quotes'],
      },
    })

    mockSqlResponses.reset()
    mockSqlResponses.push([])
    const imported = await importHandler(
      new Request('http://localhost/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: 1, entities: [], relationships: [], quotes: [] }),
      }),
      mockContext(),
    )

    expect(imported.status).toBe(200)
    expect(await imported.json()).toMatchObject({
      imported: 0,
      skipped: 0,
      failed: [],
      scope: { kind: 'legacy-partial' },
    })
  })

  it('Momentos sube y sirve media namespaced por el usuario autenticado', async () => {
    const uploaded = await uploadHandler(
      new Request('http://localhost/api/momentos-upload', {
        method: 'POST',
        body: formWithFile(
          new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' }),
        ),
      }),
      mockContext(),
    )

    expect(uploaded.status).toBe(200)
    const uploadBody = await uploaded.json()
    expect(uploadBody.storageKey).toMatch(/^legacy-single-user\/[a-f0-9]{32}\.png$/)

    const served = await fileHandler(
      new Request(`http://localhost/api/momentos-file/${uploadBody.storageKey}`),
      mockContext({
        userId: 'legacy-single-user',
        key: uploadBody.storageKey.split('/')[1],
      }),
    )

    expect(served.status).toBe(200)
    expect(served.headers.get('Content-Type')).toBe('image/png')
  })

  it('endpoint LLM respeta cost-cap antes de llamar al modelo', async () => {
    aiMocks.checkMonthlyBudget.mockResolvedValueOnce(
      Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 }),
    )
    mockSqlResponses.push([])

    const res = await extractHandler(
      new Request('http://localhost/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Borges y el tiempo' }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(429)
    expect(aiMocks.askLLMForJson).not.toHaveBeenCalled()
  })
})
