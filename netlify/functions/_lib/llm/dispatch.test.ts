import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LLMTransientError } from './retry'
import type { ChainLink } from './provider-chain'
import type { LLMProvider, ProviderConfig, RawResult } from './types'

/**
 * `dispatch.ts` es el router de TODO el subsistema LLM: elige proveedor,
 * decide si cae a otro cuando el primero falla, y decide si sirve de caché.
 * Estaba al 24 % de ramas — tres de cada cuatro decisiones sin verificar.
 *
 * La invariante que domina el fichero, y la que más caro sale romper:
 *
 *   **un fallo PERMANENTE (4xx: clave mala, petición inválida) NO cae al
 *   siguiente proveedor.**
 *
 * Si cayera, una clave mal configurada gastaría una llamada facturada en cada
 * proveedor de la cadena, y el error real quedaría enterrado bajo un «todos
 * los proveedores fallaron». Sólo lo transitorio (5xx / 429 / red), que llega
 * envuelto en `LLMTransientError`, justifica probar otro.
 *
 * Todo lo de fuera se dobla: aquí se prueban las DECISIONES del despachador,
 * no los proveedores ni el formato SSE (que tienen sus propios tests).
 */
const config = (model: string): ProviderConfig => ({
  baseUrl: `https://api.${model}.test`,
  model,
  costPerMillionIn: 1,
  costPerMillionOut: 2,
})

const link = (provider: LLMProvider): ChainLink => ({
  provider,
  apiKey: `key-${provider}`,
  config: config(provider),
})

const raw = (content: unknown): RawResult => ({
  content,
  tokensIn: 10,
  tokensOut: 20,
})

// ── Dobles ──────────────────────────────────────────────────────────────────
const askOpenAICompatible = vi.hoisted(() => vi.fn())
const askAnthropic = vi.hoisted(() => vi.fn())
const askGemini = vi.hoisted(() => vi.fn())
const askOpenAIVision = vi.hoisted(() => vi.fn())
const askGeminiVision = vi.hoisted(() => vi.fn())
const openOpenAICompatibleStream = vi.hoisted(() => vi.fn())
const buildProviderChain = vi.hoisted(() => vi.fn())
const resolveProvider = vi.hoisted(() => vi.fn())
const readLLMCache = vi.hoisted(() => vi.fn())
const writeLLMCacheBestEffort = vi.hoisted(() => vi.fn())
const readFallbackProviders = vi.hoisted(() => vi.fn(() => [] as string[]))
const readVisionProvider = vi.hoisted(() => vi.fn())
const readDedicatedKey = vi.hoisted(() => vi.fn())
const logEvent = vi.hoisted(() => vi.fn())

vi.mock('./providers/openai-compatible.js', () => ({
  askOpenAICompatible,
  askOpenAIVision,
  openOpenAICompatibleStream,
}))
vi.mock('./providers/anthropic.js', () => ({ askAnthropic }))
vi.mock('./providers/gemini.js', () => ({ askGemini, askGeminiVision }))
vi.mock('./provider-chain.js', () => ({ buildProviderChain, resolveProvider }))
vi.mock('./cache-policy.js', () => ({
  buildPrimaryLLMCacheKey: vi.fn(async () => 'clave-primaria'),
  buildVisionLLMCacheKey: vi.fn(async () => 'clave-vision'),
  readLLMCache,
  writeLLMCacheBestEffort,
}))
vi.mock('../observability.js', () => ({ logEvent }))
vi.mock('./config.js', async (importActual) => ({
  ...(await importActual<typeof import('./config')>()),
  readMaxTokens: () => 1000,
  readCacheTtlSeconds: () => 300,
  computeCostCents: () => 0.5,
  readApiKeyFor: (p: string) => `key-${p}`,
  readFallbackProviders,
  readVisionProvider,
  readDedicatedKey,
}))

const { askLLMForJson, askLLMForText, askLLMForTextStreaming, askLLMForVision } =
  await import('./dispatch')

beforeEach(() => {
  buildProviderChain.mockReturnValue([link('deepseek')])
  resolveProvider.mockReturnValue(link('deepseek'))
  readLLMCache.mockResolvedValue(null)
  readFallbackProviders.mockReturnValue([])
  askOpenAICompatible.mockResolvedValue(raw('respuesta'))
  askAnthropic.mockResolvedValue(raw('respuesta anthropic'))
  askGemini.mockResolvedValue(raw('respuesta gemini'))
})

afterEach(() => {
  vi.clearAllMocks()
})

// ────────────────────────────────────────────────────────────────────────────
describe('askLLMForJson · la cadena de proveedores', () => {
  it('llama al primario y devuelve su respuesta', async () => {
    const res = await askLLMForJson([{ role: 'user', content: 'hola' }])

    expect(res.content).toBe('respuesta')
    expect(res.usage.provider).toBe('deepseek')
    expect(res.fromCache).toBe(false)
    expect(askOpenAICompatible).toHaveBeenCalledTimes(1)
  })

  /** Un acierto de caché no gasta ni una llamada facturada. */
  it('sirve de caché sin tocar ningún proveedor', async () => {
    readLLMCache.mockResolvedValue({
      content: 'cacheado',
      usage: {
        provider: 'deepseek',
        model: 'd',
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs: 0,
      },
      fromCache: true,
    })

    const res = await askLLMForJson([{ role: 'user', content: 'hola' }])

    expect(res.fromCache).toBe(true)
    expect(askOpenAICompatible).not.toHaveBeenCalled()
    expect(askAnthropic).not.toHaveBeenCalled()
    expect(askGemini).not.toHaveBeenCalled()
  })

  it('rutea a cada proveedor por su implementación', async () => {
    buildProviderChain.mockReturnValue([link('anthropic')])
    await askLLMForJson([{ role: 'user', content: 'x' }])
    expect(askAnthropic).toHaveBeenCalledTimes(1)
    expect(askOpenAICompatible).not.toHaveBeenCalled()

    vi.clearAllMocks()
    askGemini.mockResolvedValue(raw('g'))
    readLLMCache.mockResolvedValue(null)
    buildProviderChain.mockReturnValue([link('gemini')])
    await askLLMForJson([{ role: 'user', content: 'x' }])
    expect(askGemini).toHaveBeenCalledTimes(1)
  })

  it('estalla si no se pudo resolver ningún proveedor', async () => {
    buildProviderChain.mockReturnValue([])

    await expect(askLLMForJson([{ role: 'user', content: 'x' }])).rejects.toThrow(
      /ningún provider/i,
    )
  })

  describe('fallback', () => {
    it('cae al siguiente ante un fallo TRANSITORIO', async () => {
      buildProviderChain.mockReturnValue([link('deepseek'), link('anthropic')])
      askOpenAICompatible.mockRejectedValue(new LLMTransientError('503'))

      const res = await askLLMForJson([{ role: 'user', content: 'x' }])

      expect(res.usage.provider).toBe('anthropic')
      expect(res.content).toBe('respuesta anthropic')
      expect(logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'llm_fallback_succeeded', used: 'anthropic' }),
      )
    })

    /**
     * EL invariante del fichero. Un 4xx es un bug de credenciales o de
     * petición: probar otro proveedor no lo arregla, gasta una llamada
     * facturada de más y entierra el error real.
     */
    it('NO cae al siguiente ante un fallo permanente', async () => {
      buildProviderChain.mockReturnValue([link('deepseek'), link('anthropic')])
      askOpenAICompatible.mockRejectedValue(new Error('HTTP 401 unauthorized'))

      await expect(askLLMForJson([{ role: 'user', content: 'x' }])).rejects.toThrow(
        '401 unauthorized',
      )
      expect(askAnthropic).not.toHaveBeenCalled()
    })

    it('relanza el transitorio del último eslabón en vez de tragárselo', async () => {
      buildProviderChain.mockReturnValue([link('deepseek'), link('anthropic')])
      askOpenAICompatible.mockRejectedValue(new LLMTransientError('503'))
      askAnthropic.mockRejectedValue(new LLMTransientError('502'))

      await expect(askLLMForJson([{ role: 'user', content: 'x' }])).rejects.toThrow('502')
      expect(askAnthropic).toHaveBeenCalledTimes(1)
    })

    it('no anuncia fallback cuando responde el primario', async () => {
      buildProviderChain.mockReturnValue([link('deepseek'), link('anthropic')])

      await askLLMForJson([{ role: 'user', content: 'x' }])

      expect(logEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: 'llm_fallback_succeeded' }),
      )
    })

    /**
     * Documentado en el propio fichero: la clave de caché se ancla al
     * PRIMARIO, así que lo que responde un fallback se guarda bajo esa clave
     * y la siguiente petición idéntica no vuelve a estrellarse contra el
     * proveedor caído.
     */
    it('cachea la respuesta del fallback bajo la clave del primario', async () => {
      buildProviderChain.mockReturnValue([link('deepseek'), link('anthropic')])
      askOpenAICompatible.mockRejectedValue(new LLMTransientError('503'))

      await askLLMForJson([{ role: 'user', content: 'x' }])

      expect(writeLLMCacheBestEffort).toHaveBeenCalledWith(
        expect.objectContaining({ cacheKey: 'clave-primaria' }),
      )
    })
  })

  it('askLLMForText pide modo texto', async () => {
    await askLLMForText([{ role: 'user', content: 'x' }])

    // (apiKey, config, messages, maxTokens, mode)
    expect(askOpenAICompatible.mock.calls[0]![4]).toBe('text')
  })
})

// ────────────────────────────────────────────────────────────────────────────
/** Lee un generador de frames hasta agotarlo. */
async function recoger<T>(gen: AsyncGenerator<T, void, void>): Promise<T[]> {
  const frames: T[] = []
  for await (const f of gen) frames.push(f)
  return frames
}

/** Un cuerpo SSE que entrega los bloques dados y termina. */
function cuerpoSse(bloques: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder()
      for (const b of bloques) controller.enqueue(enc.encode(b))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

describe('askLLMForTextStreaming', () => {
  /**
   * Anthropic y Gemini no tienen streaming cableado. En vez de fallar, el
   * despachador les mantiene el contrato: un `chunk` con todo el texto y su
   * `done`. Si esto se rompiera, el chat quedaría mudo con esos proveedores
   * sin que nada lo avisara.
   */
  it.each(['anthropic', 'gemini'] as const)(
    'da a %s un solo chunk y su done, no un error',
    async (provider) => {
      resolveProvider.mockReturnValue(link(provider))
      buildProviderChain.mockReturnValue([link(provider)])

      const frames = await recoger(
        askLLMForTextStreaming([{ role: 'user', content: 'x' }]),
      )

      expect(frames.map((f) => f.type)).toEqual(['chunk', 'done'])
      expect(openOpenAICompatibleStream).not.toHaveBeenCalled()
    },
  )

  it('un fallo con anthropic/gemini sale como frame de error, no como excepción', async () => {
    resolveProvider.mockReturnValue(link('anthropic'))
    buildProviderChain.mockReturnValue([link('anthropic')])
    askAnthropic.mockRejectedValue(new Error('se cayó'))

    const frames = await recoger(askLLMForTextStreaming([{ role: 'user', content: 'x' }]))

    expect(frames).toEqual([{ type: 'error', message: 'se cayó' }])
  })

  it('trocea el SSE en chunks y cierra con el usage acumulado', async () => {
    openOpenAICompatibleStream.mockResolvedValue(
      cuerpoSse([
        'data: {"choices":[{"delta":{"content":"Hola"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" mundo"}}]}\n\n',
        'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":7,"completion_tokens":3}}\n\n',
        'data: [DONE]\n\n',
      ]),
    )

    const frames = await recoger(askLLMForTextStreaming([{ role: 'user', content: 'x' }]))

    const chunks = frames.filter((f) => f.type === 'chunk')
    expect(chunks.map((c) => ('content' in c ? c.content : ''))).toEqual([
      'Hola',
      ' mundo',
    ])

    const done = frames.at(-1)!
    expect(done.type).toBe('done')
    if (done.type === 'done') {
      expect(done.content).toBe('Hola mundo')
      expect(done.usage.tokensIn).toBe(7)
      expect(done.usage.tokensOut).toBe(3)
      // El SSE real siempre pega al proveedor: nunca puede decir que vino de caché.
      expect(done.fromCache).toBe(false)
    }
  })

  it('un HTTP no-ok del stream sale como error con su código', async () => {
    openOpenAICompatibleStream.mockResolvedValue(
      new Response('sin cuota', { status: 429 }),
    )

    const frames = await recoger(askLLMForTextStreaming([{ role: 'user', content: 'x' }]))

    expect(frames).toHaveLength(1)
    expect(frames[0]!.type).toBe('error')
    expect('message' in frames[0]! && frames[0]!.message).toContain('429')
  })

  /**
   * Abrir el stream puede fallar de forma transitoria. Con fallbacks
   * configurados se recurre a la cadena normal y se emite en un chunk: el
   * usuario ve su respuesta en vez de un error, aunque sin escritura
   * progresiva.
   */
  it('si abrir el stream falla y hay fallbacks, responde por la vía normal', async () => {
    openOpenAICompatibleStream.mockRejectedValue(new LLMTransientError('503'))
    readFallbackProviders.mockReturnValue(['anthropic'])

    const frames = await recoger(askLLMForTextStreaming([{ role: 'user', content: 'x' }]))

    expect(frames.map((f) => f.type)).toEqual(['chunk', 'done'])
  })

  it('sin fallbacks configurados, el fallo al abrir sale como error', async () => {
    openOpenAICompatibleStream.mockRejectedValue(new LLMTransientError('503'))
    readFallbackProviders.mockReturnValue([])

    const frames = await recoger(askLLMForTextStreaming([{ role: 'user', content: 'x' }]))

    expect(frames).toHaveLength(1)
    expect(frames[0]!.type).toBe('error')
  })

  /** Un permanente al abrir no debe intentar la vía alternativa. */
  it('un fallo permanente al abrir no prueba la vía normal', async () => {
    openOpenAICompatibleStream.mockRejectedValue(new Error('401'))
    readFallbackProviders.mockReturnValue(['anthropic'])

    const frames = await recoger(askLLMForTextStreaming([{ role: 'user', content: 'x' }]))

    expect(frames[0]!.type).toBe('error')
    expect(askOpenAICompatible).not.toHaveBeenCalled()
  })
})

// ────────────────────────────────────────────────────────────────────────────
describe('askLLMForVision', () => {
  const imagen = () =>
    askLLMForVision('sistema', 'lee esto', 'BASE64', 'image/png', undefined)

  beforeEach(() => {
    readVisionProvider.mockReturnValue({ provider: 'openai', apiKey: 'key-openai' })
    askOpenAIVision.mockResolvedValue(raw({ texto: 'ocr' }))
    askGeminiVision.mockResolvedValue(raw({ texto: 'ocr gemini' }))
  })

  it('usa el proveedor de visión resuelto por el entorno', async () => {
    const res = await imagen()

    expect(res.usage.provider).toBe('openai')
    expect(askOpenAIVision).toHaveBeenCalledTimes(1)
    expect(askGeminiVision).not.toHaveBeenCalled()
  })

  it('sirve de caché sin llamar a ningún proveedor de visión', async () => {
    readLLMCache.mockResolvedValue({
      content: { texto: 'cacheado' },
      usage: {
        provider: 'openai',
        model: 'm',
        tokensIn: 0,
        tokensOut: 0,
        costCents: 0,
        durationMs: 0,
      },
      fromCache: true,
    })

    const res = await imagen()

    expect(res.fromCache).toBe(true)
    expect(askOpenAIVision).not.toHaveBeenCalled()
  })

  describe('override', () => {
    it('honra un override vision-capable', async () => {
      await askLLMForVision('s', 'u', 'B', 'image/png', { provider: 'gemini' })

      expect(askGeminiVision).toHaveBeenCalledTimes(1)
      expect(readVisionProvider).not.toHaveBeenCalled()
    })

    /**
     * Sólo openai y gemini tienen API de visión cableada. Un override a
     * deepseek/anthropic se IGNORA y manda el entorno: obedecerlo llamaría a
     * un endpoint que no existe y rompería la extracción desde imagen.
     */
    it.each(['deepseek', 'anthropic'] as const)(
      'ignora un override a %s, que no ve imágenes',
      async (provider) => {
        await askLLMForVision('s', 'u', 'B', 'image/png', { provider })

        expect(readVisionProvider).toHaveBeenCalled()
        expect(askOpenAIVision).toHaveBeenCalledTimes(1)
      },
    )

    it('un override de modelo sustituye el del proveedor', async () => {
      await askLLMForVision('s', 'u', 'B', 'image/png', { model: 'gpt-5-vision' })

      const [, configUsada] = askOpenAIVision.mock.calls[0]!
      expect(configUsada.model).toBe('gpt-5-vision')
    })
  })

  describe('cadena de visión', () => {
    /**
     * Dos condiciones, no una: el otro proveedor tiene que estar en
     * AI_FALLBACK_PROVIDERS **y** tener clave dedicada. Sin clave propia, caer
     * a él fallaría con un 401 y habría gastado la llamada.
     */
    it('cae al otro proveedor si está en fallbacks Y tiene clave dedicada', async () => {
      readFallbackProviders.mockReturnValue(['gemini'])
      readDedicatedKey.mockReturnValue('key-gemini-dedicada')
      askOpenAIVision.mockRejectedValue(new LLMTransientError('503'))

      const res = await askLLMForVision('s', 'u', 'B', 'image/png')

      expect(res.usage.provider).toBe('gemini')
      expect(logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'llm_vision_fallback_succeeded' }),
      )
    })

    it('sin clave dedicada no hay cadena, aunque esté en fallbacks', async () => {
      readFallbackProviders.mockReturnValue(['gemini'])
      readDedicatedKey.mockReturnValue(undefined)
      askOpenAIVision.mockRejectedValue(new LLMTransientError('503'))

      await expect(askLLMForVision('s', 'u', 'B', 'image/png')).rejects.toThrow('503')
      expect(askGeminiVision).not.toHaveBeenCalled()
    })

    it('sin estar en fallbacks no hay cadena, aunque tenga clave', async () => {
      readFallbackProviders.mockReturnValue([])
      readDedicatedKey.mockReturnValue('key-gemini-dedicada')
      askOpenAIVision.mockRejectedValue(new LLMTransientError('503'))

      await expect(askLLMForVision('s', 'u', 'B', 'image/png')).rejects.toThrow('503')
      expect(askGeminiVision).not.toHaveBeenCalled()
    })

    /** La misma regla que en texto: un permanente no justifica otra llamada. */
    it('NO cae al otro proveedor ante un fallo permanente', async () => {
      readFallbackProviders.mockReturnValue(['gemini'])
      readDedicatedKey.mockReturnValue('key-gemini-dedicada')
      askOpenAIVision.mockRejectedValue(new Error('HTTP 400 imagen inválida'))

      await expect(askLLMForVision('s', 'u', 'B', 'image/png')).rejects.toThrow(
        'imagen inválida',
      )
      expect(askGeminiVision).not.toHaveBeenCalled()
    })

    it('cachea lo que respondió el fallback', async () => {
      readFallbackProviders.mockReturnValue(['gemini'])
      readDedicatedKey.mockReturnValue('key-gemini-dedicada')
      askOpenAIVision.mockRejectedValue(new LLMTransientError('503'))

      await askLLMForVision('s', 'u', 'B', 'image/png')

      expect(writeLLMCacheBestEffort).toHaveBeenCalledWith(
        expect.objectContaining({ cacheKey: 'clave-vision' }),
      )
    })
  })
})
