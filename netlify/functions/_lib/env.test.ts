import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getEnv, resetEnvCache } from './env'

describe('getEnv', () => {
  beforeEach(() => {
    resetEnvCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    resetEnvCache()
  })

  it('aplica defaults cuando ninguna env var está seteada', () => {
    vi.stubGlobal('Netlify', { env: { get: () => undefined } })
    const env = getEnv()
    expect(env.AI_PROVIDER).toBe('deepseek')
    expect(env.AI_API_KEY).toBeUndefined()
    // O1: AI_DB_CACHE_ENABLED default ON (opt-out semantics).
    expect(env.AI_DB_CACHE_ENABLED).toBe(true)
    expect(env.ALLOW_LEGACY_FALLBACK).toBe(false)
  })

  it('coerce strings numéricos a number', () => {
    vi.stubGlobal('Netlify', {
      env: {
        get: (k: string) => {
          if (k === 'AI_MAX_TOKENS') return '2048'
          if (k === 'AI_MONTHLY_BUDGET_CENTS') return '1000'
          if (k === 'COST_ALERT_THRESHOLD_PCT') return '80'
          return undefined
        },
      },
    })
    const env = getEnv()
    expect(env.AI_MAX_TOKENS).toBe(2048)
    expect(env.AI_MONTHLY_BUDGET_CENTS).toBe(1000)
    expect(env.COST_ALERT_THRESHOLD_PCT).toBe(80)
  })

  it('coerce flags booleanos ("true" / "1" / "on" → true)', () => {
    vi.stubGlobal('Netlify', {
      env: {
        get: (k: string) => {
          if (k === 'ALLOW_LEGACY_FALLBACK') return 'true'
          if (k === 'AI_DB_CACHE_ENABLED') return '1'
          return undefined
        },
      },
    })
    const env = getEnv()
    expect(env.ALLOW_LEGACY_FALLBACK).toBe(true)
    expect(env.AI_DB_CACHE_ENABLED).toBe(true)
  })

  it('ALLOW_LEGACY_FALLBACK (boolFlag) cae a false con "false"', () => {
    vi.stubGlobal('Netlify', {
      env: {
        get: (k: string) => (k === 'ALLOW_LEGACY_FALLBACK' ? 'false' : undefined),
      },
    })
    expect(getEnv().ALLOW_LEGACY_FALLBACK).toBe(false)
  })

  it('AI_DB_CACHE_ENABLED (boolFlagDefaultOn) cae a false solo con "false"/"0"/"off"', () => {
    // Empty string mantiene default ON.
    vi.stubGlobal('Netlify', {
      env: {
        get: (k: string) => (k === 'AI_DB_CACHE_ENABLED' ? '' : undefined),
      },
    })
    expect(getEnv().AI_DB_CACHE_ENABLED).toBe(true)

    // Explicit false → off.
    resetEnvCache()
    vi.stubGlobal('Netlify', {
      env: {
        get: (k: string) => (k === 'AI_DB_CACHE_ENABLED' ? 'false' : undefined),
      },
    })
    expect(getEnv().AI_DB_CACHE_ENABLED).toBe(false)
  })

  it('lee strings sin coerce', () => {
    vi.stubGlobal('Netlify', {
      env: {
        get: (k: string) => {
          if (k === 'AI_API_KEY') return 'sk-test-12345'
          if (k === 'AI_VISION_PROVIDER') return 'openai'
          return undefined
        },
      },
    })
    const env = getEnv()
    expect(env.AI_API_KEY).toBe('sk-test-12345')
    expect(env.AI_VISION_PROVIDER).toBe('openai')
  })

  it('valida URL para COST_ALERT_WEBHOOK_URL', () => {
    vi.stubGlobal('Netlify', {
      env: {
        get: (k: string) => {
          if (k === 'COST_ALERT_WEBHOOK_URL') return 'not-a-url'
          return undefined
        },
      },
    })
    const env = getEnv()
    // validación falla → fallback a defaults (URL undefined)
    expect(env.COST_ALERT_WEBHOOK_URL).toBeUndefined()
  })

  it('cachea el resultado entre llamadas', () => {
    const getter = vi.fn().mockReturnValue(undefined)
    vi.stubGlobal('Netlify', { env: { get: getter } })
    getEnv()
    getEnv()
    getEnv()
    // Después de la primera llamada (que invoca read por cada key) las
    // siguientes no deben invocar nada — el cache devuelve el objeto.
    const callsAfter3 = getter.mock.calls.length
    getEnv()
    expect(getter.mock.calls.length).toBe(callsAfter3)
  })

  it('resetEnvCache invalida y re-lee', () => {
    let returnedKey = 'first'
    vi.stubGlobal('Netlify', {
      env: { get: (k: string) => (k === 'AI_PROVIDER' ? returnedKey : undefined) },
    })
    expect(getEnv().AI_PROVIDER).toBe('first')
    returnedKey = 'second'
    expect(getEnv().AI_PROVIDER).toBe('first') // cache
    resetEnvCache()
    expect(getEnv().AI_PROVIDER).toBe('second') // re-leído
  })

  it('si Netlify.env no existe, lee de process.env', () => {
    process.env.AI_PROVIDER = 'anthropic'
    // No stub de Netlify global → la implementación cae a process.env.
    const env = getEnv()
    expect(env.AI_PROVIDER).toBe('anthropic')
    delete process.env.AI_PROVIDER
  })
})
