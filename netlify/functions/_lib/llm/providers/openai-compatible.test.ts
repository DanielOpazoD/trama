import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  askOpenAICompatible,
  askOpenAIVision,
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

/**
 * Las dos entradas principales del proveedor por defecto, que estaban sin
 * cubrir (de ahí el 50 % de ramas del fichero).
 *
 * Lo que más caro sale: `isNewOpenAIModel` decide, **desde el nombre del
 * modelo**, si se manda `max_tokens` o `max_completion_tokens` y si se manda
 * temperatura. Los modelos nuevos rechazan el parámetro viejo con un 400
 * `unsupported_parameter`, así que equivocarse falla el 100 % de las llamadas
 * a esa familia — y como la decisión sale de una expresión regular, se rompe
 * en silencio al añadir un modelo.
 */
const configCon = (model: string) => ({
  baseUrl: 'https://api.test/v1',
  model,
  costPerMillionIn: 10,
  costPerMillionOut: 30,
})

const chatOk = (texto: string) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: texto } }],
    usage: { prompt_tokens: 12, completion_tokens: 34 },
  }),
})

function cuerpoDe(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls.at(-1)!
  return JSON.parse(init.body)
}

function stubFetch(respuesta: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(respuesta)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('askOpenAICompatible', () => {
  it('los modelos clásicos reciben max_tokens y temperatura', async () => {
    const fetchMock = stubFetch(chatOk('hola'))

    await askOpenAICompatible('k', configCon('deepseek-chat'), [], 500, 'text')

    const body = cuerpoDe(fetchMock)
    expect(body.max_tokens).toBe(500)
    expect(body.max_completion_tokens).toBeUndefined()
    expect(body.temperature).toBe(0.6)
  })

  /** Mandarles `max_tokens` o temperatura da un 400 `unsupported_parameter`. */
  it('los modelos nuevos reciben max_completion_tokens y NINGUNA temperatura', async () => {
    const fetchMock = stubFetch(chatOk('{"ok":true}'))

    await askOpenAICompatible('k', configCon('gpt-5'), [], 500, 'json')

    const body = cuerpoDe(fetchMock)
    expect(body.max_completion_tokens).toBe(500)
    expect(body.max_tokens).toBeUndefined()
    expect(body.temperature).toBeUndefined()
  })

  it('el modo json baja la temperatura y pide json_object', async () => {
    const fetchMock = stubFetch(chatOk('{"a":1}'))

    const res = await askOpenAICompatible('k', configCon('gpt-4o'), [], 100, 'json')

    const body = cuerpoDe(fetchMock)
    expect(body.temperature).toBe(0.2)
    expect(body.response_format).toEqual({ type: 'json_object' })
    // Y llega ya parseado, no como cadena.
    expect(res.content).toEqual({ a: 1 })
  })

  it('el modo texto no pide formato y devuelve la cadena', async () => {
    const fetchMock = stubFetch(chatOk('hola'))

    const res = await askOpenAICompatible('k', configCon('gpt-4o'), [], 100, 'text')

    expect(cuerpoDe(fetchMock).response_format).toBeUndefined()
    expect(res.content).toBe('hola')
  })

  it('manda la clave como Bearer y lee el recuento de tokens', async () => {
    const fetchMock = stubFetch(chatOk('hola'))

    const res = await askOpenAICompatible(
      'k-secreta',
      configCon('gpt-4o'),
      [],
      100,
      'text',
    )

    const [url, init] = fetchMock.mock.calls.at(-1)!
    expect(String(url)).toContain('/chat/completions')
    expect(init.headers.Authorization).toBe('Bearer k-secreta')
    expect(res.tokensIn).toBe(12)
    expect(res.tokensOut).toBe(34)
  })

  /**
   * Un 4xx es permanente: `fetchWithRetry` lo devuelve sin reintentar y este
   * proveedor lo convierte en un error con su código. (Un 429 NO sirve para
   * este test: es transitorio, se reintenta con backoff real y acaba saliendo
   * como `LLMTransientError`, que es otra cosa.)
   */
  it('un HTTP permanente estalla con su código', async () => {
    stubFetch({ ok: false, status: 400, text: async () => 'petición inválida' })

    await expect(
      askOpenAICompatible('k', configCon('gpt-4o'), [], 100, 'text'),
    ).rejects.toThrow(/400/)
  })
})

describe('askOpenAIVision', () => {
  it('manda la imagen como data URL con su mime', async () => {
    const fetchMock = stubFetch(chatOk('{"ocr":"texto"}'))

    await askOpenAIVision(
      'k',
      configCon('gpt-4o'),
      'sistema',
      'lee',
      'BASE64DATA',
      'image/png',
      100,
    )

    const body = JSON.stringify(cuerpoDe(fetchMock))
    expect(body).toContain('data:image/png;base64,BASE64DATA')
  })

  it('un HTTP no-ok en visión también estalla', async () => {
    stubFetch({ ok: false, status: 400, text: async () => 'imagen inválida' })

    await expect(
      askOpenAIVision('k', configCon('gpt-4o'), 's', 'u', 'B', 'image/png', 100),
    ).rejects.toThrow(/400/)
  })
})
