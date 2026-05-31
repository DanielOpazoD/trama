import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'
import { resetEnvCache } from './env'

vi.mock('./db.js', () => setupMockSql())

import aiSettingsHandler from '../ai-settings'
import chatThreadsHandler from '../chat-threads'
import entitiesLookupHandler from '../entities-lookup'
import entitiesRefsCountHandler from '../entities-refs-count'
import extractionLogHandler from '../extraction-log'
import quoteEchoesHandler from '../quote-echoes'

describe('ai-settings endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    process.env['AI_PROVIDER'] = 'openai'
    process.env['AI_VISION_PROVIDER'] = 'gemini'
    resetEnvCache()
  })

  afterEach(() => {
    delete process.env['AI_PROVIDER']
    delete process.env['AI_VISION_PROVIDER']
    resetEnvCache()
  })

  it('GET devuelve defaults de entorno y rows por tarea del usuario', async () => {
    mockSqlResponses.push([
      {
        task: 'extract',
        provider: 'openai',
        model: 'gpt-4o',
        verify_with: 'gemini',
        updated_at: '2026-01-01',
      },
    ])

    const res = await aiSettingsHandler(
      new Request('http://localhost/api/ai-settings'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.defaultProvider).toBe('openai')
    expect(body.visionDefaultProvider).toBe('gemini')
    expect(body.tasks).toEqual(
      expect.arrayContaining([
        {
          task: 'extract',
          provider: 'openai',
          model: 'gpt-4o',
          verifyWith: 'gemini',
          updatedAt: '2026-01-01',
        },
        expect.objectContaining({ task: 'chat', provider: null }),
      ]),
    )
    expect(mockSqlResponses.calls[0]?.template).toMatch(/WHERE user_id/)
    expect(mockSqlResponses.calls[0]?.values).toContain('legacy-single-user')
  })

  it('PUT upsertea provider/model/verifier y permite borrar para volver al default', async () => {
    const upsert = await aiSettingsHandler(
      new Request('http://localhost/api/ai-settings', {
        method: 'PUT',
        body: JSON.stringify({
          task: 'extract',
          provider: 'openai',
          model: 'gpt-4o',
          verifyWith: 'gemini',
        }),
      }),
      mockContext(),
    )

    expect(upsert.status).toBe(204)
    expect(
      mockSqlResponses.calls.some((c) => /INSERT INTO users/i.test(c.template)),
    ).toBe(true)
    expect(
      mockSqlResponses.calls.some((c) =>
        /INSERT INTO ai_task_providers/i.test(c.template),
      ),
    ).toBe(true)

    mockSqlResponses.reset()
    const deleted = await aiSettingsHandler(
      new Request('http://localhost/api/ai-settings', {
        method: 'PUT',
        body: JSON.stringify({ task: 'extract', provider: '' }),
      }),
      mockContext(),
    )

    expect(deleted.status).toBe(204)
    expect(mockSqlResponses.calls.at(-1)?.template).toMatch(
      /DELETE FROM ai_task_providers/,
    )
  })

  it('valida task, provider, verifier y método', async () => {
    const invalidTask = await aiSettingsHandler(
      new Request('http://localhost/api/ai-settings', {
        method: 'PUT',
        body: JSON.stringify({ task: 'nope', provider: 'openai' }),
      }),
      mockContext(),
    )
    expect(invalidTask.status).toBe(400)

    const invalidProvider = await aiSettingsHandler(
      new Request('http://localhost/api/ai-settings', {
        method: 'PUT',
        body: JSON.stringify({ task: 'extract', provider: 'local' }),
      }),
      mockContext(),
    )
    expect(invalidProvider.status).toBe(400)

    const sameVerifier = await aiSettingsHandler(
      new Request('http://localhost/api/ai-settings', {
        method: 'PUT',
        body: JSON.stringify({
          task: 'extract',
          provider: 'openai',
          verifyWith: 'openai',
        }),
      }),
      mockContext(),
    )
    expect(sameVerifier.status).toBe(400)

    const method = await aiSettingsHandler(
      new Request('http://localhost/api/ai-settings', { method: 'POST' }),
      mockContext(),
    )
    expect(method.status).toBe(405)
  })
})

describe('entities-refs-count endpoint', () => {
  beforeEach(() => mockSqlResponses.reset())

  it('suma citas y relaciones por ambos extremos, aislado por usuario', async () => {
    mockSqlResponses.push(
      [
        { entity_id: 'e1', n: '2' },
        { entity_id: 'e2', n: '1' },
      ],
      [
        { id: 'e1', n: '3' },
        { id: 'e3', n: '4' },
      ],
      [
        { id: 'e1', n: '1' },
        { id: 'e2', n: '5' },
      ],
    )

    const res = await entitiesRefsCountHandler(
      new Request('http://localhost/api/entities-refs-count'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      items: [
        { id: 'e1', quoteCount: 2, relCount: 4 },
        { id: 'e2', quoteCount: 1, relCount: 5 },
        { id: 'e3', quoteCount: 0, relCount: 4 },
      ],
    })
    for (const call of mockSqlResponses.calls) {
      expect(call.template).toMatch(/deleted_at IS NULL/)
      expect(call.template).toMatch(/user_id/)
    }
  })

  it('rechaza métodos no GET', async () => {
    const res = await entitiesRefsCountHandler(
      new Request('http://localhost/api/entities-refs-count', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(405)
  })
})

describe('chat-threads endpoint', () => {
  beforeEach(() => mockSqlResponses.reset())

  it('lista threads activos con messageCount camelCase', async () => {
    mockSqlResponses.push([
      {
        id: 't1',
        title: 'Hilo',
        context: 'ctx',
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
        message_count: '3',
      },
    ])

    const res = await chatThreadsHandler(
      new Request('http://localhost/api/chat/threads'),
      mockContext(),
    )

    expect(await res.json()).toEqual([
      {
        id: 't1',
        title: 'Hilo',
        context: 'ctx',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-02',
        messageCount: 3,
      },
    ])
    expect(mockSqlResponses.calls[0]?.template).toMatch(/deleted_at IS NULL/)
    expect(mockSqlResponses.calls[0]?.template).toMatch(/t.user_id/)
  })

  it('crea y soft-deletea threads del usuario', async () => {
    mockSqlResponses.push(
      [],
      [
        {
          id: 't2',
          title: 'Nuevo',
          context: null,
          created_at: '2026-01-03',
          updated_at: '2026-01-03',
        },
      ],
    )

    const created = await chatThreadsHandler(
      new Request('http://localhost/api/chat/threads', {
        method: 'POST',
        body: JSON.stringify({ title: '  Nuevo  ', context: ' ' }),
      }),
      mockContext(),
    )

    expect(created.status).toBe(201)
    expect(await created.json()).toMatchObject({
      id: 't2',
      title: 'Nuevo',
      context: null,
      messageCount: 0,
    })

    mockSqlResponses.reset()
    const deleted = await chatThreadsHandler(
      new Request('http://localhost/api/chat/threads/t2', { method: 'DELETE' }),
      mockContext({ id: 't2' }),
    )

    expect(deleted.status).toBe(204)
    expect(mockSqlResponses.calls.at(-1)?.template).toMatch(/SET deleted_at = NOW/)
  })

  it('devuelve error canónico si insert no retorna fila y 405 en métodos inválidos', async () => {
    mockSqlResponses.push([], [])
    const failed = await chatThreadsHandler(
      new Request('http://localhost/api/chat/threads', {
        method: 'POST',
        body: JSON.stringify({ title: 'Nuevo' }),
      }),
      mockContext(),
    )
    expect(failed.status).toBe(500)

    const method = await chatThreadsHandler(
      new Request('http://localhost/api/chat/threads', { method: 'PATCH' }),
      mockContext(),
    )
    expect(method.status).toBe(405)
  })
})

describe('entities-lookup endpoint', () => {
  beforeEach(() => mockSqlResponses.reset())

  it('requiere criterio de búsqueda y soporta name/prefix/ids', async () => {
    const missing = await entitiesLookupHandler(
      new Request('http://localhost/api/entities-lookup'),
      mockContext(),
    )
    expect(missing.status).toBe(400)

    mockSqlResponses.push([{ id: 'e1', name: 'Borges' }])
    const byName = await entitiesLookupHandler(
      new Request('http://localhost/api/entities-lookup?name=Borges'),
      mockContext(),
    )
    expect(await byName.json()).toEqual([{ id: 'e1', name: 'Borges' }])
    expect(mockSqlResponses.calls.at(-1)?.template).toMatch(/lower\(name\)/)

    const emptyPrefix = await entitiesLookupHandler(
      new Request('http://localhost/api/entities-lookup?prefix=%20'),
      mockContext(),
    )
    expect(await emptyPrefix.json()).toEqual([])

    mockSqlResponses.push([{ id: 'e2', name: 'Bioy' }])
    const byIds = await entitiesLookupHandler(
      new Request('http://localhost/api/entities-lookup?ids=e2,,e3'),
      mockContext(),
    )
    expect(await byIds.json()).toEqual([{ id: 'e2', name: 'Bioy' }])
    expect(mockSqlResponses.calls.at(-1)?.template).toMatch(/ANY/)
  })

  it('rechaza métodos no GET', async () => {
    const res = await entitiesLookupHandler(
      new Request('http://localhost/api/entities-lookup', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(405)
  })
})

describe('extraction-log endpoint', () => {
  beforeEach(() => mockSqlResponses.reset())

  it('devuelve entries camelCase y totales numéricos filtrados por user_id', async () => {
    mockSqlResponses.push(
      [
        {
          id: 'l1',
          input_text: 'texto',
          proposal: { entities: [] },
          provider: 'openai',
          model: 'gpt',
          tokens_in: 10,
          tokens_out: 5,
          cost_cents: '1.5',
          duration_ms: 25,
          error: null,
          created_at: '2026-01-01',
        },
      ],
      [{ total_calls: '2', total_cost_cents: '3.5', total_tokens: '42' }],
    )

    const res = await extractionLogHandler(
      new Request('http://localhost/api/extraction-log?limit=500'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      entries: [
        {
          id: 'l1',
          inputText: 'texto',
          proposal: { entities: [] },
          provider: 'openai',
          model: 'gpt',
          tokensIn: 10,
          tokensOut: 5,
          costCents: 1.5,
          durationMs: 25,
          error: null,
          createdAt: '2026-01-01',
        },
      ],
      totals: { totalCalls: 2, totalCostCents: 3.5, totalTokens: 42 },
    })
    expect(mockSqlResponses.calls[0]?.values).toContain(200)
    for (const call of mockSqlResponses.calls) {
      expect(call.template).toMatch(/user_id/)
    }
  })

  it('rechaza métodos no GET', async () => {
    const res = await extractionLogHandler(
      new Request('http://localhost/api/extraction-log', { method: 'POST' }),
      mockContext(),
    )

    expect(res.status).toBe(405)
  })
})

describe('quote-echoes endpoint', () => {
  beforeEach(() => mockSqlResponses.reset())

  it('devuelve ecos camelCase y exige id de cita', async () => {
    mockSqlResponses.push([
      { id: 'q2', entity_name: 'Borges', text: 'texto eco', source: null },
    ])

    const res = await quoteEchoesHandler(
      new Request('http://localhost/api/quotes/q1/echoes'),
      mockContext({ id: 'q1' }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { id: 'q2', entityName: 'Borges', text: 'texto eco', source: null },
    ])
    expect(mockSqlResponses.calls[0]?.template).toMatch(/embedding IS NOT NULL/)
    expect(mockSqlResponses.calls[0]?.values).toContain('legacy-single-user')

    const missing = await quoteEchoesHandler(
      new Request('http://localhost/api/quotes//echoes'),
      mockContext(),
    )
    expect(missing.status).toBe(400)
  })

  it('rechaza métodos no GET', async () => {
    const res = await quoteEchoesHandler(
      new Request('http://localhost/api/quotes/q1/echoes', { method: 'POST' }),
      mockContext({ id: 'q1' }),
    )

    expect(res.status).toBe(405)
  })
})
