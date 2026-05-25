/**
 * Configuración de providers + lectores de env vars.
 *
 * Variables que reconoce:
 *   AI_PROVIDER  → 'deepseek' | 'openai' | 'gemini' | 'anthropic'  (default 'deepseek')
 *   AI_API_KEY   → DeepSeek's API key (legacy name; permanece como
 *                  canónico para DeepSeek por compat). También sirve de
 *                  fallback compartido para otros providers.
 *   OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY → per-provider keys.
 *   AI_MAX_TOKENS → optional cap on completion tokens (default 4096)
 *   AI_CACHE_TTL_SECONDS → optional in-memory cache TTL (default 600)
 *   AI_VISION_PROVIDER / AI_VISION_API_KEY → canal dedicado para vision.
 */

import type { LLMProvider, ProviderConfig } from './types.js'

export const PROVIDER_DEFAULTS: Record<LLMProvider, ProviderConfig> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    costPerMillionIn: 14,
    costPerMillionOut: 28,
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    costPerMillionIn: 15,
    costPerMillionOut: 60,
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-haiku-4-5-20251001',
    costPerMillionIn: 100,
    costPerMillionOut: 500,
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    costPerMillionIn: 7.5,
    costPerMillionOut: 30,
  },
}

/**
 * Per-provider env var names. DeepSeek keeps the legacy AI_API_KEY name
 * (it's the historical default y cambiarlo rompe setups existentes);
 * everyone else uses their canonical PROVIDER_API_KEY name.
 */
const PROVIDER_KEY_ENV: Record<LLMProvider, string> = {
  deepseek: 'AI_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
}

export function readProvider(): LLMProvider {
  const raw = (Netlify.env.get('AI_PROVIDER') ?? 'deepseek').toLowerCase()
  if (raw === 'openai' || raw === 'gemini' || raw === 'anthropic' || raw === 'deepseek') {
    return raw
  }
  throw new Error(`AI_PROVIDER no reconocido: ${raw}`)
}

/**
 * Resolve the API key for a given provider. El canonical env var se
 * intenta primero; AI_API_KEY actúa de fallback para non-deepseek
 * providers (DeepSeek YA usa AI_API_KEY como canonical).
 */
export function readApiKeyFor(provider: LLMProvider): string {
  const canonical = PROVIDER_KEY_ENV[provider]
  const specific = Netlify.env.get(canonical)
  if (specific) return specific
  if (provider !== 'deepseek') {
    const fallback = Netlify.env.get('AI_API_KEY')
    if (fallback) return fallback
  }
  throw new Error(
    provider === 'deepseek'
      ? 'AI_API_KEY no está configurada (key de DeepSeek).'
      : `No hay API key para ${provider}. Configura ${canonical} ` +
          `(recomendado) o AI_API_KEY como fallback compartido.`,
  )
}

/**
 * Vision support: OpenAI (gpt-4o-mini) y Gemini. DeepSeek Chat no toma
 * imágenes; Anthropic sí pero no lo cableamos.
 *
 * Si AI_PROVIDER es uno vision-capable lo usamos directo. Si no, leemos
 * AI_VISION_PROVIDER + AI_VISION_API_KEY como canal separado — para que
 * usuarios puedan tener DeepSeek de default y OpenAI/Gemini solo para
 * vision.
 */
export function readVisionProvider(): { provider: 'openai' | 'gemini'; apiKey: string } {
  const visionOverride = Netlify.env.get('AI_VISION_PROVIDER')?.toLowerCase()
  if (visionOverride === 'openai' || visionOverride === 'gemini') {
    const key =
      Netlify.env.get('AI_VISION_API_KEY') ??
      Netlify.env.get(PROVIDER_KEY_ENV[visionOverride]) ??
      Netlify.env.get('AI_API_KEY')
    if (!key) {
      throw new Error(
        `AI_VISION_PROVIDER=${visionOverride} pero no hay key disponible ` +
          `(probé AI_VISION_API_KEY, ${PROVIDER_KEY_ENV[visionOverride]}, AI_API_KEY).`,
      )
    }
    return { provider: visionOverride, apiKey: key }
  }
  if (visionOverride && visionOverride !== '') {
    throw new Error(
      `AI_VISION_PROVIDER no reconocido: ${visionOverride}. Usa "openai" o "gemini".`,
    )
  }
  const main = readProvider()
  if (main === 'openai' || main === 'gemini') {
    return { provider: main, apiKey: readApiKeyFor(main) }
  }
  throw new Error(
    `El proveedor configurado (${main}) no soporta imágenes. ` +
      'Configura AI_VISION_PROVIDER=openai o gemini, y AI_VISION_API_KEY.',
  )
}

export function readMaxTokens(): number {
  const raw = Netlify.env.get('AI_MAX_TOKENS')
  const n = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : 4096
}

export function readCacheTtlSeconds(): number {
  const raw = Netlify.env.get('AI_CACHE_TTL_SECONDS')
  const n = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 600
}

export function computeCostCents(
  usage: { tokensIn: number; tokensOut: number },
  config: ProviderConfig,
): number {
  return (
    (usage.tokensIn * config.costPerMillionIn) / 1_000_000 +
    (usage.tokensOut * config.costPerMillionOut) / 1_000_000
  )
}
