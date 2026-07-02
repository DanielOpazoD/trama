import {
  PROVIDER_DEFAULTS,
  readApiKeyFor,
  readDedicatedKey,
  readFallbackProviders,
  readProvider,
} from './config.js'
import type { LLMOverride, LLMProvider, ProviderConfig } from './types.js'

export type ChainLink = {
  provider: LLMProvider
  apiKey: string
  config: ProviderConfig
}

/**
 * Resuelve (provider, apiKey, config) desde override o env. Override.provider
 * invalido cae al env. Override.model swaps in para el modelo del provider.
 */
export function resolveProvider(override?: LLMOverride): ChainLink {
  let provider = readProvider()
  if (override?.provider) {
    const p = override.provider.toLowerCase()
    if (p === 'openai' || p === 'gemini' || p === 'anthropic' || p === 'deepseek') {
      provider = p
    }
  }
  const apiKey = readApiKeyFor(provider)
  const baseConfig = PROVIDER_DEFAULTS[provider]
  const config: ProviderConfig = override?.model
    ? { ...baseConfig, model: override.model }
    : baseConfig
  return { provider, apiKey, config }
}

/**
 * Cadena ordenada [primario, ...fallbacks]. El primario sale de resolveProvider
 * (honra override + key compartida, y lanza si no hay key). Los fallbacks
 * vienen de AI_FALLBACK_PROVIDERS y solo entran con key dedicada.
 */
export function buildProviderChain(override?: LLMOverride): ChainLink[] {
  const primary = resolveProvider(override)
  const chain: ChainLink[] = [primary]
  for (const fb of readFallbackProviders()) {
    if (fb === primary.provider) continue
    const apiKey = readDedicatedKey(fb)
    if (!apiKey) continue
    chain.push({ provider: fb, apiKey, config: PROVIDER_DEFAULTS[fb] })
  }
  return chain
}
