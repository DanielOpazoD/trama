import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askLLMForJson, clearLLMCache } from './llm'

function stubEnv(provider: string | undefined, apiKey: string | undefined) {
  vi.stubGlobal('Netlify', {
    env: {
      get: vi.fn((key: string) => {
        if (key === 'AI_PROVIDER') return provider
        if (key === 'AI_API_KEY') return apiKey
        return undefined
      }),
    },
  })
}

function mockFetch(response: Record<string, unknown>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(response),
    json: async () => response,
  })
}

beforeEach(() => {
  stubEnv('deepseek', 'test-key')
  clearLLMCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const SIMPLE_RESPONSE_OPENAI = {
  choices: [{ message: { content: '{"result": "ok"}' } }],
}

const SIMPLE_RESPONSE_ANTHROPIC = {
  content: [{ type: 'text', text: '{"result": "ok"}' }],
}

const SIMPLE_RESPONSE_GEMINI = {
  candidates: [{ content: { parts: [{ text: '{"result": "ok"}' }] } }],
}

describe('askLLMForJson — provider routing', () => {
  it('defaults to DeepSeek when AI_PROVIDER is not set', async () => {
    stubEnv(undefined, 'test-key')
    const fetchMock = mockFetch(SIMPLE_RESPONSE_OPENAI)
    vi.stubGlobal('fetch', fetchMock)

    await askLLMForJson([{ role: 'user', content: 'hi' }])

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('api.deepseek.com')
  })

  it('routes to OpenAI when AI_PROVIDER=openai', async () => {
    stubEnv('openai', 'test-key')
    const fetchMock = mockFetch(SIMPLE_RESPONSE_OPENAI)
    vi.stubGlobal('fetch', fetchMock)

    await askLLMForJson([{ role: 'user', content: 'hi' }])

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('api.openai.com')
  })

  it('routes to Anthropic with x-api-key header', async () => {
    stubEnv('anthropic', 'test-key')
    const fetchMock = mockFetch(SIMPLE_RESPONSE_ANTHROPIC)
    vi.stubGlobal('fetch', fetchMock)

    await askLLMForJson([{ role: 'user', content: 'hi' }])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('api.anthropic.com')
    expect(init.headers['x-api-key']).toBe('test-key')
    expect(init.headers['anthropic-version']).toBeDefined()
  })

  it('routes to Gemini with key as query param', async () => {
    stubEnv('gemini', 'test-key')
    const fetchMock = mockFetch(SIMPLE_RESPONSE_GEMINI)
    vi.stubGlobal('fetch', fetchMock)

    await askLLMForJson([{ role: 'user', content: 'hi' }])

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('generativelanguage.googleapis.com')
    expect(url).toContain('key=test-key')
  })

  it('throws on unknown provider', async () => {
    stubEnv('unknown-provider', 'test-key')
    vi.stubGlobal('fetch', vi.fn())

    await expect(askLLMForJson([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      /AI_PROVIDER/,
    )
  })

  it('throws when AI_API_KEY is missing', async () => {
    stubEnv('deepseek', undefined)
    vi.stubGlobal('fetch', vi.fn())

    await expect(askLLMForJson([{ role: 'user', content: 'hi' }])).rejects.toThrow(
      /AI_API_KEY/,
    )
  })

  it('prefers the per-provider key over AI_API_KEY', async () => {
    vi.stubGlobal('Netlify', {
      env: {
        get: vi.fn((key: string) => {
          if (key === 'AI_PROVIDER') return 'openai'
          if (key === 'OPENAI_API_KEY') return 'specific-openai-key'
          if (key === 'AI_API_KEY') return 'shared-fallback-key'
          return undefined
        }),
      },
    })
    const fetchMock = mockFetch(SIMPLE_RESPONSE_OPENAI)
    vi.stubGlobal('fetch', fetchMock)

    await askLLMForJson([{ role: 'user', content: 'hi' }])

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Authorization']).toBe('Bearer specific-openai-key')
  })

  it('falls back to AI_API_KEY when the per-provider key is absent', async () => {
    vi.stubGlobal('Netlify', {
      env: {
        get: vi.fn((key: string) => {
          if (key === 'AI_PROVIDER') return 'openai'
          if (key === 'AI_API_KEY') return 'shared-fallback-key'
          return undefined
        }),
      },
    })
    const fetchMock = mockFetch(SIMPLE_RESPONSE_OPENAI)
    vi.stubGlobal('fetch', fetchMock)

    await askLLMForJson([{ role: 'user', content: 'hi' }])

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['Authorization']).toBe('Bearer shared-fallback-key')
  })
})

describe('askLLMForJson — OpenAI-compatible request shape', () => {
  it('uses Bearer auth and json_object response format', async () => {
    const fetchMock = mockFetch(SIMPLE_RESPONSE_OPENAI)
    vi.stubGlobal('fetch', fetchMock)

    await askLLMForJson([
      { role: 'system', content: 'system msg' },
      { role: 'user', content: 'user msg' },
    ])

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/chat/completions')
    expect(init.method).toBe('POST')
    expect(init.headers['Authorization']).toBe('Bearer test-key')
    expect(init.headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(init.body)
    expect(body.model).toBeDefined()
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages).toEqual([
      { role: 'system', content: 'system msg' },
      { role: 'user', content: 'user msg' },
    ])
  })

  it('parses choices[0].message.content as JSON', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        choices: [{ message: { content: '{"foo": "bar", "n": 42}' } }],
      }),
    )

    const result = await askLLMForJson([{ role: 'user', content: 'x' }])
    expect(result.content).toEqual({ foo: 'bar', n: 42 })
  })
})

describe('askLLMForJson — Anthropic request shape', () => {
  beforeEach(() => stubEnv('anthropic', 'test-key'))

  it('flattens system + user messages and demands JSON in system addendum', async () => {
    const fetchMock = mockFetch(SIMPLE_RESPONSE_ANTHROPIC)
    vi.stubGlobal('fetch', fetchMock)

    await askLLMForJson([
      { role: 'system', content: 'original system' },
      { role: 'user', content: 'user msg' },
    ])

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.system).toContain('original system')
    expect(body.system).toMatch(/JSON/)
    expect(body.messages).toEqual([{ role: 'user', content: 'user msg' }])
    expect(body.max_tokens).toBeGreaterThan(0)
  })

  it('extracts text from content[0].text', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        content: [{ type: 'text', text: '{"r": 1}' }],
      }),
    )
    const result = await askLLMForJson([{ role: 'user', content: 'x' }])
    expect(result.content).toEqual({ r: 1 })
  })
})

describe('askLLMForJson — Gemini request shape', () => {
  beforeEach(() => stubEnv('gemini', 'test-key'))

  it('puts system in systemInstruction and forwards each non-system message as its own contents item', async () => {
    const fetchMock = mockFetch(SIMPLE_RESPONSE_GEMINI)
    vi.stubGlobal('fetch', fetchMock)

    await askLLMForJson([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
    ])

    const [, init] = fetchMock.mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'sys' }] })
    expect(body.contents).toHaveLength(2)
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'a' }] })
    expect(body.contents[1]).toEqual({ role: 'user', parts: [{ text: 'b' }] })
    expect(body.generationConfig.responseMimeType).toBe('application/json')
  })
})

describe('askLLMForJson — usage tracking', () => {
  it('returns tokens and cost from OpenAI-style response', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        choices: [{ message: { content: '{}' } }],
        usage: { prompt_tokens: 1000, completion_tokens: 500 },
      }),
    )

    const result = await askLLMForJson([{ role: 'user', content: 'x' }])
    expect(result.usage.tokensIn).toBe(1000)
    expect(result.usage.tokensOut).toBe(500)
    expect(result.usage.provider).toBe('deepseek')
    expect(result.usage.model).toBe('deepseek-chat')
    // deepseek: 14 in + 28 out per million. 1000 in + 500 out → 0.014 + 0.014 = 0.028 cents
    expect(result.usage.costCents).toBeCloseTo(0.028, 4)
  })

  it('returns 0 tokens when API omits usage', async () => {
    vi.stubGlobal('fetch', mockFetch({ choices: [{ message: { content: '{}' } }] }))
    const result = await askLLMForJson([{ role: 'user', content: 'x' }])
    expect(result.usage.tokensIn).toBe(0)
    expect(result.usage.tokensOut).toBe(0)
    expect(result.usage.costCents).toBe(0)
  })
})

describe('askLLMForJson — retry behavior', () => {
  it('retries on 500 and eventually succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'server error',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(SIMPLE_RESPONSE_OPENAI),
        json: async () => SIMPLE_RESPONSE_OPENAI,
      })
    vi.stubGlobal('fetch', fetchMock)

    const result = await askLLMForJson([
      { role: 'user', content: 'unique-content-for-retry-test-' + Math.random() },
    ])
    expect(result.content).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  }, 10000)

  it('does NOT retry on 400 (client error)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      askLLMForJson([{ role: 'user', content: 'unique-' + Math.random() }]),
    ).rejects.toThrow(/400/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('askLLMForJson — caching', () => {
  it('returns cached result for identical messages', async () => {
    const fetchMock = mockFetch(SIMPLE_RESPONSE_OPENAI)
    vi.stubGlobal('fetch', fetchMock)
    const messages = [{ role: 'user' as const, content: 'cache-test-' + Math.random() }]

    const first = await askLLMForJson(messages)
    const second = await askLLMForJson(messages)

    expect(first.fromCache).toBe(false)
    expect(second.fromCache).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does NOT cache when AI_CACHE_TTL_SECONDS is 0', async () => {
    vi.stubGlobal('Netlify', {
      env: {
        get: vi.fn((key: string) => {
          if (key === 'AI_PROVIDER') return 'deepseek'
          if (key === 'AI_API_KEY') return 'test-key'
          if (key === 'AI_CACHE_TTL_SECONDS') return '0'
          return undefined
        }),
      },
    })
    const fetchMock = mockFetch(SIMPLE_RESPONSE_OPENAI)
    vi.stubGlobal('fetch', fetchMock)
    const messages = [{ role: 'user' as const, content: 'no-cache-' + Math.random() }]

    await askLLMForJson(messages)
    await askLLMForJson(messages)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('askLLMForJson — error propagation', () => {
  it('throws when fetch returns non-retryable 4xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'invalid api key',
        json: async () => ({}),
      }),
    )
    await expect(
      askLLMForJson([{ role: 'user', content: 'unique-401-' + Math.random() }]),
    ).rejects.toThrow(/401/)
  })

  it('throws when response has no content', async () => {
    vi.stubGlobal('fetch', mockFetch({ choices: [{ message: {} }] }))
    await expect(askLLMForJson([{ role: 'user', content: 'x' }])).rejects.toThrow()
  })
})
