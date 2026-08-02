import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '../types'

/**
 * Gemini tiene su propio fichero por sus **rarezas de protocolo**, y son
 * exactamente lo que hay que fijar: si alguna se pierde, la llamada no falla
 * con un error claro — devuelve algo peor.
 *
 *   - La clave va **en la URL** (`?key=…`), no en una cabecera.
 *   - El mensaje de sistema va en `systemInstruction`, **fuera** de `contents`.
 *     Si se colara en `contents`, Gemini lo leería como un turno del usuario y
 *     las instrucciones pasarían a ser parte de la conversación.
 *   - El rol `assistant` se llama `model`. Sin traducir, el historial queda
 *     mal atribuido y el modelo se responde a sí mismo.
 *
 * `fetchWithRetry` se dobla en passthrough para poder inspeccionar la petición
 * real que se construye.
 */
const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('../retry.js', () => ({
  fetchWithRetry: (fn: () => Promise<Response>) => fn(),
}))

const { askGemini, askGeminiVision } = await import('./gemini')

const config: ProviderConfig = {
  baseUrl: 'https://gemini.test/v1',
  model: 'gemini-2.0-flash',
  costPerMillionIn: 10,
  costPerMillionOut: 30,
}

const respuesta = (texto: string, usage?: Record<string, number>) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: texto }] } }],
      ...(usage ? { usageMetadata: usage } : {}),
    }),
    { status: 200 },
  )

/** El cuerpo JSON que se envió en la última llamada. */
function cuerpoEnviado(): Record<string, never> {
  const [, init] = fetchMock.mock.calls.at(-1)!
  return JSON.parse(init.body)
}

function urlLlamada(): string {
  return String(fetchMock.mock.calls.at(-1)![0])
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockResolvedValue(respuesta('hola'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('askGemini', () => {
  it('manda la clave en la URL, no en una cabecera', async () => {
    await askGemini('k-secreta', config, [{ role: 'user', content: 'hola' }], 100, 'text')

    expect(urlLlamada()).toContain('?key=k-secreta')
    const [, init] = fetchMock.mock.calls.at(-1)!
    expect(JSON.stringify(init.headers)).not.toContain('k-secreta')
  })

  it('usa el endpoint generateContent del modelo configurado', async () => {
    await askGemini('k', config, [{ role: 'user', content: 'x' }], 100, 'text')

    expect(urlLlamada()).toContain('/models/gemini-2.0-flash:generateContent')
  })

  /** El sistema es instrucción, no conversación. */
  it('separa el mensaje de sistema y NO lo mete en contents', async () => {
    await askGemini(
      'k',
      config,
      [
        { role: 'system', content: 'eres un bibliotecario' },
        { role: 'user', content: 'hola' },
      ],
      100,
      'text',
    )

    const body = cuerpoEnviado() as Record<string, any>
    expect(body.systemInstruction.parts[0].text).toBe('eres un bibliotecario')
    expect(body.contents).toHaveLength(1)
    expect(JSON.stringify(body.contents)).not.toContain('bibliotecario')
  })

  it('traduce el rol assistant a model', async () => {
    await askGemini(
      'k',
      config,
      [
        { role: 'user', content: 'uno' },
        { role: 'assistant', content: 'dos' },
        { role: 'user', content: 'tres' },
      ],
      100,
      'text',
    )

    const body = cuerpoEnviado() as Record<string, any>
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual([
      'user',
      'model',
      'user',
    ])
  })

  describe('modo json', () => {
    it('pide respuesta JSON y baja la temperatura', async () => {
      fetchMock.mockResolvedValue(respuesta('{"a":1}'))

      const res = await askGemini(
        'k',
        config,
        [{ role: 'user', content: 'x' }],
        100,
        'json',
      )

      const body = cuerpoEnviado() as Record<string, any>
      expect(body.generationConfig.responseMimeType).toBe('application/json')
      expect(body.generationConfig.temperature).toBe(0.2)
      // Y el texto llega ya parseado, no como cadena.
      expect(res.content).toEqual({ a: 1 })
    })

    it('en modo texto no pide JSON y sube la temperatura', async () => {
      const res = await askGemini(
        'k',
        config,
        [{ role: 'user', content: 'x' }],
        100,
        'text',
      )

      const body = cuerpoEnviado() as Record<string, any>
      expect(body.generationConfig.responseMimeType).toBeUndefined()
      expect(body.generationConfig.temperature).toBe(0.6)
      expect(res.content).toBe('hola')
    })
  })

  it('respeta el tope de tokens', async () => {
    await askGemini('k', config, [{ role: 'user', content: 'x' }], 4096, 'text')

    expect(
      (cuerpoEnviado() as Record<string, any>).generationConfig.maxOutputTokens,
    ).toBe(4096)
  })

  describe('lo que sale mal', () => {
    it('un HTTP no-ok estalla con el código y el cuerpo', async () => {
      fetchMock.mockResolvedValue(new Response('cuota agotada', { status: 429 }))

      await expect(
        askGemini('k', config, [{ role: 'user', content: 'x' }], 100, 'text'),
      ).rejects.toThrow(/429.*cuota agotada/s)
    })

    /**
     * Gemini puede responder 200 con `candidates` vacío —filtro de seguridad,
     * por ejemplo—. Sin esta guarda, `content` sería `undefined` y el fallo
     * aparecería mucho más lejos, ya sin contexto.
     */
    it('una respuesta sin texto estalla en vez de devolver vacío', async () => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
      )

      await expect(
        askGemini('k', config, [{ role: 'user', content: 'x' }], 100, 'text'),
      ).rejects.toThrow(/no devolvió texto/)
    })
  })

  describe('recuento de tokens', () => {
    it('lee el usage que informa Gemini', async () => {
      fetchMock.mockResolvedValue(
        respuesta('hola', { promptTokenCount: 120, candidatesTokenCount: 45 }),
      )

      const res = await askGemini(
        'k',
        config,
        [{ role: 'user', content: 'x' }],
        100,
        'text',
      )

      expect(res.tokensIn).toBe(120)
      expect(res.tokensOut).toBe(45)
    })

    /** Sin usage informado, cero — nunca `undefined`, que rompería el coste. */
    it('sin usage informado cuenta cero, no indefinido', async () => {
      fetchMock.mockResolvedValue(respuesta('hola'))

      const res = await askGemini(
        'k',
        config,
        [{ role: 'user', content: 'x' }],
        100,
        'text',
      )

      expect(res.tokensIn).toBe(0)
      expect(res.tokensOut).toBe(0)
    })
  })
})

describe('askGeminiVision', () => {
  it('manda la imagen como inlineData con su mime', async () => {
    fetchMock.mockResolvedValue(respuesta('{"ocr":"texto"}'))

    await askGeminiVision('k', config, 'sistema', 'lee', 'BASE64DATA', 'image/png', 100)

    const body = JSON.stringify(cuerpoEnviado())
    expect(body).toContain('inlineData')
    expect(body).toContain('image/png')
    expect(body).toContain('BASE64DATA')
  })

  it('un HTTP no-ok en visión también estalla', async () => {
    fetchMock.mockResolvedValue(new Response('imagen inválida', { status: 400 }))

    await expect(
      askGeminiVision('k', config, 's', 'u', 'B', 'image/png', 100),
    ).rejects.toThrow(/400/)
  })
})
