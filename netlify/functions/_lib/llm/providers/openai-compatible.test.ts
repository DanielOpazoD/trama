import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  embedOpenAI,
  isNewOpenAIModel,
  openOpenAICompatibleStream,
  transcribeOpenAI,
} from './openai-compatible'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isNewOpenAIModel', () => {
  it('detecta los modelos nuevos que exigen max_completion_tokens', () => {
    for (const m of [
      'gpt-5.4-mini',
      'gpt-5.4',
      'gpt-5.5',
      'gpt-5',
      'o1',
      'o3-mini',
      'o4-mini',
    ]) {
      expect(isNewOpenAIModel(m)).toBe(true)
    }
  })

  it('deja los modelos clásicos con max_tokens + temperatura libre', () => {
    for (const m of [
      'gpt-4o-mini',
      'gpt-4o',
      'gpt-4.1-mini',
      'deepseek-chat',
      'deepseek-reasoner',
      '',
    ]) {
      expect(isNewOpenAIModel(m)).toBe(false)
    }
  })
})

describe('embedOpenAI', () => {
  it('llama al endpoint de embeddings con modelo e input explícitos', async () => {
    const vector = [0.1, 0.2, 0.3]
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ embedding: vector }],
        model: 'text-embedding-3-small',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await embedOpenAI(
      'sk-test',
      { baseUrl: 'https://api.openai.com/v1', model: 'text-embedding-3-small' },
      'Borges',
    )

    expect(result).toEqual({ vector, model: 'text-embedding-3-small' })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-test',
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: 'Borges',
        }),
      }),
    )
  })
})

describe('transcribeOpenAI', () => {
  it('postea multipart al endpoint de audio SIN Content-Type manual', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ text: 'comprar pan' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const audio = new TextEncoder().encode('fake-audio').buffer
    const result = await transcribeOpenAI(
      'sk-test',
      { baseUrl: 'https://api.openai.com/v1' },
      audio,
      'audio/ogg',
      'whisper-1',
      'voz.ogg',
    )

    expect(result).toEqual({ text: 'comprar pan' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions')
    expect(init.method).toBe('POST')
    // Solo Authorization: el boundary de multipart lo pone fetch a partir del
    // FormData; setear Content-Type a mano lo rompería.
    expect(init.headers).toEqual({ Authorization: 'Bearer sk-test' })
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('model')).toBe('whisper-1')
  })

  it('lanza si la respuesta no trae texto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }),
    )
    await expect(
      transcribeOpenAI(
        'sk-test',
        { baseUrl: 'https://api.openai.com/v1' },
        new ArrayBuffer(4),
        'audio/ogg',
        'whisper-1',
        'voz.ogg',
      ),
    ).rejects.toThrow(/sin texto/i)
  })
})

describe('openOpenAICompatibleStream', () => {
  it('abre el stream de chat en el provider con usage incluido', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { getReader: vi.fn() },
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await openOpenAICompatibleStream(
      'sk-test',
      { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      [{ role: 'user', content: 'hola' }],
      512,
    )

    expect(response.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer sk-test',
        },
      }),
    )
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body)).toEqual({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hola' }],
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.6,
      max_tokens: 512,
    })
  })
})
