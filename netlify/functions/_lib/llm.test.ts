import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askLLMForJson } from './llm'

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

  it('puts system in systemInstruction and concatenates user messages', async () => {
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
    expect(body.contents[0].parts[0].text).toContain('a')
    expect(body.contents[0].parts[0].text).toContain('b')
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

describe('askLLMForJson — error propagation', () => {
  it('throws when fetch returns non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => 'rate limited',
        json: async () => ({}),
      }),
    )
    await expect(askLLMForJson([{ role: 'user', content: 'x' }])).rejects.toThrow(
      /429/,
    )
  })

  it('throws when response has no content', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({ choices: [{ message: {} }] }),
    )
    await expect(askLLMForJson([{ role: 'user', content: 'x' }])).rejects.toThrow()
  })
})
