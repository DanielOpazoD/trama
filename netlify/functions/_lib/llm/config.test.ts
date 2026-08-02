import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '../env'
import {
  PROVIDER_DEFAULTS,
  computeCostCents,
  readCacheTtlSeconds,
  readFallbackProviders,
  readVisionProvider,
} from './config'

/**
 * La configuración del subsistema LLM: qué proveedor, con qué clave, cuánto
 * cuesta y qué cadena de reserva hay.
 *
 * Dos zonas concentran el riesgo:
 *
 *   - **`computeCostCents`** traduce tokens a dinero. Es la función que
 *     alimenta el tope mensual; un factor equivocado no rompe nada visible.
 *   - **`readVisionProvider`** resuelve la clave de visión por una cadena de
 *     precedencia (`AI_VISION_API_KEY` → la del proveedor → `AI_API_KEY`).
 *     Quien configura una clave específica de visión espera que gane, y si el
 *     orden se invierte se usaría la compartida sin que nada avise.
 */
function stubEnv(valores: Record<string, string | undefined>) {
  vi.stubGlobal('Netlify', { env: { get: (k: string) => valores[k] } })
  resetEnvCache()
}

beforeEach(() => {
  stubEnv({})
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetEnvCache()
})

describe('computeCostCents', () => {
  it('cobra entrada y salida a sus tarifas respectivas', () => {
    const config = {
      ...PROVIDER_DEFAULTS.openai,
      costPerMillionIn: 100,
      costPerMillionOut: 300,
    }

    // 1M de entrada a 100 + 1M de salida a 300.
    expect(computeCostCents({ tokensIn: 1_000_000, tokensOut: 1_000_000 }, config)).toBe(
      400,
    )
  })

  /**
   * La salida suele costar más que la entrada. Si se intercambiaran las
   * tarifas, el gasto quedaría infravalorado en la mayoría de las llamadas
   * —donde el prompt es largo y la respuesta corta— sin que nada fallara.
   */
  it('no confunde la tarifa de entrada con la de salida', () => {
    const config = {
      ...PROVIDER_DEFAULTS.openai,
      costPerMillionIn: 10,
      costPerMillionOut: 1000,
    }

    const muchaEntrada = computeCostCents({ tokensIn: 1_000_000, tokensOut: 0 }, config)
    const muchaSalida = computeCostCents({ tokensIn: 0, tokensOut: 1_000_000 }, config)

    expect(muchaEntrada).toBe(10)
    expect(muchaSalida).toBe(1000)
  })

  it('una llamada sin tokens no cuesta nada', () => {
    expect(
      computeCostCents({ tokensIn: 0, tokensOut: 0 }, PROVIDER_DEFAULTS.openai),
    ).toBe(0)
  })

  it('escala linealmente con los tokens', () => {
    const config = PROVIDER_DEFAULTS.openai
    const uno = computeCostCents({ tokensIn: 1000, tokensOut: 1000 }, config)
    const diez = computeCostCents({ tokensIn: 10_000, tokensOut: 10_000 }, config)

    expect(diez).toBeCloseTo(uno * 10, 10)
  })
})

describe('readCacheTtlSeconds', () => {
  it('usa 600 segundos por defecto', () => {
    expect(readCacheTtlSeconds()).toBe(600)
  })

  it('respeta el valor configurado', () => {
    stubEnv({ AI_CACHE_TTL_SECONDS: '30' })
    expect(readCacheTtlSeconds()).toBe(30)
  })

  /** Cero es válido: desactiva la caché sin quitar la variable. */
  it('acepta cero como desactivación explícita', () => {
    stubEnv({ AI_CACHE_TTL_SECONDS: '0' })
    expect(readCacheTtlSeconds()).toBe(0)
  })

  it('ignora un valor negativo y vuelve al defecto', () => {
    stubEnv({ AI_CACHE_TTL_SECONDS: '-5' })
    expect(readCacheTtlSeconds()).toBe(600)
  })
})

describe('readFallbackProviders', () => {
  it('sin configurar, no hay cadena', () => {
    expect(readFallbackProviders()).toEqual([])
  })

  it('parte por comas y normaliza espacios y mayúsculas', () => {
    stubEnv({ AI_FALLBACK_PROVIDERS: ' OpenAI , anthropic ' })
    expect(readFallbackProviders()).toEqual(['openai', 'anthropic'])
  })

  it('descarta nombres que no son proveedores', () => {
    stubEnv({ AI_FALLBACK_PROVIDERS: 'openai,inventado,gemini' })
    expect(readFallbackProviders()).toEqual(['openai', 'gemini'])
  })

  /** Un duplicado repetiría la misma llamada facturada dentro de la cadena. */
  it('no repite un proveedor listado dos veces', () => {
    stubEnv({ AI_FALLBACK_PROVIDERS: 'openai,openai,gemini' })
    expect(readFallbackProviders()).toEqual(['openai', 'gemini'])
  })

  it('conserva el orden en que se listaron', () => {
    stubEnv({ AI_FALLBACK_PROVIDERS: 'gemini,anthropic,openai' })
    expect(readFallbackProviders()).toEqual(['gemini', 'anthropic', 'openai'])
  })
})

describe('readVisionProvider', () => {
  it('usa el proveedor principal si ya ve imágenes', () => {
    stubEnv({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k-openai' })

    expect(readVisionProvider()).toEqual({ provider: 'openai', apiKey: 'k-openai' })
  })

  /**
   * El caso que motiva todo este canal aparte: DeepSeek de principal —barato
   * para texto— y OpenAI sólo para imágenes.
   */
  it('permite un canal de visión distinto del proveedor principal', () => {
    stubEnv({
      AI_PROVIDER: 'deepseek',
      AI_API_KEY: 'k-deepseek',
      AI_VISION_PROVIDER: 'openai',
      AI_VISION_API_KEY: 'k-vision',
    })

    expect(readVisionProvider()).toEqual({ provider: 'openai', apiKey: 'k-vision' })
  })

  describe('precedencia de la clave', () => {
    it('AI_VISION_API_KEY gana sobre la del proveedor', () => {
      stubEnv({
        AI_VISION_PROVIDER: 'openai',
        AI_VISION_API_KEY: 'k-vision',
        OPENAI_API_KEY: 'k-openai',
        AI_API_KEY: 'k-compartida',
      })

      expect(readVisionProvider().apiKey).toBe('k-vision')
    })

    it('sin la específica, usa la del proveedor antes que la compartida', () => {
      stubEnv({
        AI_VISION_PROVIDER: 'openai',
        OPENAI_API_KEY: 'k-openai',
        AI_API_KEY: 'k-compartida',
      })

      expect(readVisionProvider().apiKey).toBe('k-openai')
    })

    it('cae a la compartida como último recurso', () => {
      stubEnv({ AI_VISION_PROVIDER: 'openai', AI_API_KEY: 'k-compartida' })

      expect(readVisionProvider().apiKey).toBe('k-compartida')
    })
  })

  describe('errores que explican qué falta', () => {
    it('sin ninguna clave, dice cuáles buscó', () => {
      stubEnv({ AI_VISION_PROVIDER: 'gemini' })

      expect(() => readVisionProvider()).toThrow(/AI_VISION_API_KEY/)
      expect(() => readVisionProvider()).toThrow(/AI_API_KEY/)
    })

    it('un AI_VISION_PROVIDER desconocido nombra las opciones válidas', () => {
      stubEnv({ AI_VISION_PROVIDER: 'llama' })

      expect(() => readVisionProvider()).toThrow(/no reconocido/)
      expect(() => readVisionProvider()).toThrow(/openai/)
    })

    /**
     * Sin canal de visión y con un principal que no ve imágenes, el error tiene
     * que decir qué configurar — si no, el usuario sólo ve que «la extracción
     * desde imagen no funciona».
     */
    it.each(['deepseek', 'anthropic'])(
      'con %s de principal y sin canal de visión, explica qué configurar',
      (provider) => {
        stubEnv({ AI_PROVIDER: provider, AI_API_KEY: 'k' })

        expect(() => readVisionProvider()).toThrow(/no soporta imágenes/)
        expect(() => readVisionProvider()).toThrow(/AI_VISION_PROVIDER/)
      },
    )
  })
})
