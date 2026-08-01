import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `transcription.ts` estaba en 0% de cobertura y **calcula dinero**: su
 * estimación por minuto es lo que el tope mensual de gasto contabiliza por
 * cada nota de voz. Una constante equivocada no rompe nada visible — sólo hace
 * que el cap cuente mal, en silencio, hasta que la factura no cuadra.
 *
 * Whisper cobra por MINUTO de audio y no conocemos la duración sin decodear,
 * así que se estima desde el tamaño (~3 KB/s). Lo que se fija aquí no es el
 * número exacto —es una estimación declarada— sino sus **propiedades**: que
 * crece con la duración, que nunca es cero, y que una nota de voz típica no
 * produce un disparate.
 */
const transcribeOpenAI = vi.hoisted(() => vi.fn())
const readApiKeyFor = vi.hoisted(() => vi.fn(() => 'sk-test'))

vi.mock('./providers/openai-compatible.js', () => ({ transcribeOpenAI }))
vi.mock('./config.js', async (importActual) => ({
  ...(await importActual<typeof import('./config')>()),
  readApiKeyFor,
}))

const { askLLMForTranscription } = await import('./transcription')

function stubEnv(valores: Record<string, string | undefined> = {}) {
  vi.stubGlobal('Netlify', { env: { get: (k: string) => valores[k] } })
}

const audio = (bytes: number) => new ArrayBuffer(bytes)

beforeEach(() => {
  transcribeOpenAI.mockResolvedValue({ text: 'hola qué tal' })
  readApiKeyFor.mockReturnValue('sk-test')
  stubEnv()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('askLLMForTranscription', () => {
  it('devuelve el texto transcrito y un usage de openai', async () => {
    const { text, usage } = await askLLMForTranscription(
      audio(30_000),
      'audio/ogg',
      'v.ogg',
    )

    expect(text).toBe('hola qué tal')
    expect(usage.provider).toBe('openai')
    // Whisper no cobra por tokens: informarlos distintos de cero falsearía el
    // contador de tokens del panel de costes.
    expect(usage.tokensIn).toBe(0)
    expect(usage.tokensOut).toBe(0)
  })

  it('pasa el audio, el mime y el nombre al proveedor sin tocarlos', async () => {
    const buffer = audio(1234)
    await askLLMForTranscription(buffer, 'audio/mpeg', 'nota.mp3')

    const [apiKey, config, enviado, mime, , fileName] = transcribeOpenAI.mock.calls[0]!
    expect(apiKey).toBe('sk-test')
    expect(config.baseUrl).toContain('openai')
    expect(enviado).toBe(buffer)
    expect(mime).toBe('audio/mpeg')
    expect(fileName).toBe('nota.mp3')
  })

  describe('modelo', () => {
    it('usa whisper-1 por defecto', async () => {
      const { usage } = await askLLMForTranscription(audio(3000), 'audio/ogg', 'v.ogg')
      expect(usage.model).toBe('whisper-1')
    })

    it('respeta AI_TRANSCRIPTION_MODEL', async () => {
      stubEnv({ AI_TRANSCRIPTION_MODEL: 'gpt-4o-transcribe' })
      const { usage } = await askLLMForTranscription(audio(3000), 'audio/ogg', 'v.ogg')
      expect(usage.model).toBe('gpt-4o-transcribe')
    })

    /** Fuera de Netlify el global no existe: cae al default en vez de romper. */
    it('cae a whisper-1 si no hay entorno de Netlify', async () => {
      vi.stubGlobal('Netlify', undefined)
      const { usage } = await askLLMForTranscription(audio(3000), 'audio/ogg', 'v.ogg')
      expect(usage.model).toBe('whisper-1')
    })
  })

  describe('coste estimado', () => {
    /**
     * El suelo importa: sin él, un audio diminuto costaría ~0 y una ráfaga de
     * notas cortas no movería el tope mensual en absoluto.
     */
    it('nunca baja de 0,1 céntimos, por corto que sea', async () => {
      const { usage } = await askLLMForTranscription(audio(10), 'audio/ogg', 'v.ogg')
      expect(usage.costCents).toBe(0.1)
    })

    it('crece con la duración del audio', async () => {
      const corto = await askLLMForTranscription(audio(300_000), 'audio/ogg', 'a.ogg')
      const largo = await askLLMForTranscription(audio(3_000_000), 'audio/ogg', 'b.ogg')

      expect(largo.usage.costCents).toBeGreaterThan(corto.usage.costCents)
    })

    /**
     * Una nota de voz de un minuto (~180 KB a 3 KB/s) debe costar del orden de
     * medio céntimo. Es la comprobación de orden de magnitud: caza un factor
     * mil por confundir segundos con minutos o bytes con kilobytes.
     */
    it('un minuto de audio cuesta del orden de 0,6 céntimos', async () => {
      const { usage } = await askLLMForTranscription(audio(180_000), 'audio/ogg', 'm.ogg')

      expect(usage.costCents).toBeGreaterThan(0.3)
      expect(usage.costCents).toBeLessThan(1)
    })
  })

  it('propaga el fallo del proveedor para que el caller use su plan B', async () => {
    transcribeOpenAI.mockRejectedValue(new Error('sin cuota'))

    await expect(
      askLLMForTranscription(audio(3000), 'audio/ogg', 'v.ogg'),
    ).rejects.toThrow('sin cuota')
  })
})
