import { describe, it, expect, beforeEach, vi } from 'vitest'
import { api } from './api'

// We import internal transforms by re-implementing the shape — but actually we
// can only verify them through the public api methods, which call fetch.
// Mock fetch for each test.

const ENTITY_ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  type: 'persona',
  name: 'Albert Camus',
  year: 1913,
  description: 'escritor argelino-francés',
  position_x: 12.5,
  position_y: -34.2,
  origin: { kind: 'manual' },
  created_at: '2026-05-18T10:00:00Z',
  updated_at: '2026-05-18T10:05:00Z',
}

const RELATIONSHIP_ROW = {
  id: '22222222-2222-2222-2222-222222222222',
  from_id: '11111111-1111-1111-1111-111111111111',
  to_id: '33333333-3333-3333-3333-333333333333',
  type: 'influye_en',
  notes: null,
  origin: { kind: 'ai', provider: 'deepseek', model: 'deepseek-chat' },
  created_at: '2026-05-18T11:00:00Z',
  updated_at: '2026-05-18T11:00:00Z',
}

const QUOTE_ROW = {
  id: '44444444-4444-4444-4444-444444444444',
  entity_id: '11111111-1111-1111-1111-111111111111',
  text: 'En el centro del invierno...',
  source: 'El verano',
  context: null,
  origin: 'manual', // legacy string shape, must be normalized
  created_at: '2026-05-18T12:00:00Z',
  updated_at: '2026-05-18T12:00:00Z',
}

function mockFetchJson(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
    json: async () => body,
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('api.listEntities', () => {
  it('transforms snake_case row to camelCase Entity', async () => {
    vi.stubGlobal('fetch', mockFetchJson([ENTITY_ROW]))
    const result = await api.listEntities()
    expect(result).toHaveLength(1)
    const entity = result[0]!
    expect(entity.id).toBe(ENTITY_ROW.id)
    expect(entity.type).toBe('persona')
    expect(entity.name).toBe('Albert Camus')
    expect(entity.year).toBe(1913)
    expect(entity.description).toBe('escritor argelino-francés')
    expect(entity.positionX).toBe(12.5)
    expect(entity.positionY).toBe(-34.2)
    expect(entity.origin).toEqual({ kind: 'manual' })
    expect(entity.createdAt).toBe('2026-05-18T10:00:00Z')
    expect(entity.updatedAt).toBe('2026-05-18T10:05:00Z')
  })

  it('coerces null year/description to undefined', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchJson([{ ...ENTITY_ROW, year: null, description: null }]),
    )
    const [entity] = await api.listEntities()
    expect(entity!.year).toBeUndefined()
    expect(entity!.description).toBeUndefined()
  })

  it('coerces null position to undefined', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchJson([{ ...ENTITY_ROW, position_x: null, position_y: null }]),
    )
    const [entity] = await api.listEntities()
    expect(entity!.positionX).toBeUndefined()
    expect(entity!.positionY).toBeUndefined()
  })
})

describe('api.listRelationships', () => {
  it('transforms from_id/to_id to fromId/toId', async () => {
    vi.stubGlobal('fetch', mockFetchJson([RELATIONSHIP_ROW]))
    const [rel] = await api.listRelationships()
    expect(rel!.fromId).toBe(RELATIONSHIP_ROW.from_id)
    expect(rel!.toId).toBe(RELATIONSHIP_ROW.to_id)
    expect(rel!.type).toBe('influye_en')
    expect(rel!.origin).toEqual({
      kind: 'ai',
      provider: 'deepseek',
      model: 'deepseek-chat',
    })
  })
})

describe('api.listQuotes', () => {
  it('transforms entity_id to entityId', async () => {
    vi.stubGlobal('fetch', mockFetchJson([QUOTE_ROW]))
    const [quote] = await api.listQuotes()
    expect(quote!.entityId).toBe(QUOTE_ROW.entity_id)
    expect(quote!.text).toBe('En el centro del invierno...')
    expect(quote!.source).toBe('El verano')
    expect(quote!.context).toBeUndefined()
  })

  it('normalizes legacy origin string to object', async () => {
    vi.stubGlobal('fetch', mockFetchJson([QUOTE_ROW]))
    const [quote] = await api.listQuotes()
    expect(quote!.origin).toEqual({ kind: 'manual' })
  })

  it('normalizes legacy "ai" string to ai object', async () => {
    vi.stubGlobal('fetch', mockFetchJson([{ ...QUOTE_ROW, origin: 'ai' }]))
    const [quote] = await api.listQuotes()
    expect(quote!.origin).toEqual({ kind: 'ai' })
  })

  it('falls back to manual when origin is missing', async () => {
    vi.stubGlobal('fetch', mockFetchJson([{ ...QUOTE_ROW, origin: null }]))
    const [quote] = await api.listQuotes()
    expect(quote!.origin).toEqual({ kind: 'manual' })
  })
})

describe('api.createEntity', () => {
  it('sends camelCase data as snake_case to the backend', async () => {
    const fetchMock = mockFetchJson(ENTITY_ROW, 201)
    vi.stubGlobal('fetch', fetchMock)

    await api.createEntity({
      type: 'persona',
      name: 'Albert Camus',
      year: 1913,
      description: 'escritor',
      positionX: 5,
      positionY: 10,
      origin: { kind: 'manual' },
    })

    const [, init] = fetchMock.mock.calls[0]!
    const body = JSON.parse(init.body)
    expect(body.type).toBe('persona')
    expect(body.name).toBe('Albert Camus')
    expect(body.position_x).toBe(5)
    expect(body.position_y).toBe(10)
    expect(body.origin).toEqual({ kind: 'manual' })
  })
})

describe('api.updateEntityPosition', () => {
  it('sends PATCH with snake_case position fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      text: async () => '',
      json: async () => undefined,
    })
    vi.stubGlobal('fetch', fetchMock)

    await api.updateEntityPosition('id-1', 100, 200)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/entities/id-1')
    expect(init.method).toBe('PATCH')
    const body = JSON.parse(init.body)
    expect(body).toEqual({ position_x: 100, position_y: 200 })
  })
})

describe('api error handling', () => {
  it('throws an ApiClientError with status + message on non-2xx response', async () => {
    // FF1 — el formato canónico es `{ error: { code, message, requestId } }`.
    // El cliente parsea eso y tira un ApiClientError tipado, no un Error
    // genérico con el status pegado al string.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers({ 'x-request-id': 'req-test-abc' }),
        text: async () =>
          JSON.stringify({
            error: {
              code: 'INTERNAL',
              message: 'database is on fire',
              requestId: 'req-test-abc',
            },
          }),
      }),
    )
    await expect(api.listEntities()).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 500,
      code: 'INTERNAL',
      message: 'database is on fire',
      requestId: 'req-test-abc',
    })
  })

  it('falls back gracefully when body is plain text (legacy endpoint)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: async () => 'database is on fire',
      }),
    )
    await expect(api.listEntities()).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 500,
      code: 'UNKNOWN',
      message: 'database is on fire',
    })
  })
})
