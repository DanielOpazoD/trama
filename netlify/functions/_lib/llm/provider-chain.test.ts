import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetEnvCache } from '../env'
import { buildProviderChain, resolveProvider } from './provider-chain'

function stubEnv(extra: Record<string, string | undefined>) {
  vi.stubGlobal('Netlify', {
    env: {
      get: vi.fn((key: string) => extra[key]),
    },
  })
}

beforeEach(() => {
  resetEnvCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetEnvCache()
})

describe('provider-chain', () => {
  it('honra override provider/model para el primario', () => {
    stubEnv({ AI_PROVIDER: 'deepseek', OPENAI_API_KEY: 'openai-key' })

    const link = resolveProvider({ provider: 'openai', model: 'gpt-test' })

    expect(link.provider).toBe('openai')
    expect(link.apiKey).toBe('openai-key')
    expect(link.config.model).toBe('gpt-test')
  })

  it('ignora override provider invalido y vuelve al provider de env', () => {
    stubEnv({ AI_PROVIDER: 'deepseek', AI_API_KEY: 'deepseek-key' })

    const link = resolveProvider({ provider: 'unknown' as never })

    expect(link.provider).toBe('deepseek')
    expect(link.apiKey).toBe('deepseek-key')
  })

  it('lanza si el provider resuelto no tiene API key disponible', () => {
    stubEnv({ AI_PROVIDER: 'deepseek' })

    expect(() => resolveProvider()).toThrow(/AI_API_KEY/)
  })

  it('arma fallback solo con providers distintos y key dedicada', () => {
    stubEnv({
      AI_PROVIDER: 'deepseek',
      AI_API_KEY: 'deepseek-key',
      OPENAI_API_KEY: 'openai-key',
      AI_FALLBACK_PROVIDERS: 'deepseek,openai,gemini',
    })

    const chain = buildProviderChain({ model: 'primary-model' })

    expect(chain.map((link) => link.provider)).toEqual(['deepseek', 'openai'])
    expect(chain[0]?.config.model).toBe('primary-model')
    expect(chain[1]?.config.model).toBe('gpt-4o-mini')
  })
})
