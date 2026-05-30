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
import { getEnv } from '../env.js'

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

const ALL_PROVIDERS: readonly LLMProvider[] = [
  'deepseek',
  'openai',
  'gemini',
  'anthropic',
]

export function readProvider(): LLMProvider {
  // O1: via getEnv() (default 'deepseek' lo da el schema).
  const raw = getEnv().AI_PROVIDER.toLowerCase()
  if (raw === 'openai' || raw === 'gemini' || raw === 'anthropic' || raw === 'deepseek') {
    return raw
  }
  throw new Error(`AI_PROVIDER no reconocido: ${raw}`)
}

/**
 * Cadena de fallback cross-provider. Si el provider primario tiene una caída
 * transitoria (5xx/timeout/red), el despachador intenta estos en orden.
 *
 * Se lee de `AI_FALLBACK_PROVIDERS` (lista separada por comas, p.ej.
 * "openai,gemini"). Vacío/ausente → SIN fallback (comportamiento histórico:
 * cero sorpresas de costo). Es opt-in deliberado: caer a otro provider puede
 * costar 5-7× más (ver PROVIDER_DEFAULTS), así que solo se activa si el
 * operador lo configura explícitamente. Tokens basura/duplicados se ignoran.
 */
export function readFallbackProviders(): LLMProvider[] {
  const raw = (getEnv().AI_FALLBACK_PROVIDERS ?? '').trim()
  if (!raw) return []
  const out: LLMProvider[] = []
  for (const token of raw.split(',')) {
    const p = token.trim().toLowerCase()
    if (ALL_PROVIDERS.includes(p as LLMProvider) && !out.includes(p as LLMProvider)) {
      out.push(p as LLMProvider)
    }
  }
  return out
}

/**
 * Key DEDICADA de un provider (su env var canónica), sin caer a la
 * AI_API_KEY compartida. Para providers de fallback exigimos key propia: usar
 * la key de DeepSeek contra OpenAI daría un 401 garantizado (permanente), que
 * cortaría la cadena. Devuelve null si no hay key propia → el provider se
 * omite de la cadena. Nota: para deepseek su key canónica ES AI_API_KEY.
 */
export function readDedicatedKey(provider: LLMProvider): string | null {
  const env = getEnv()
  if (provider === 'deepseek') return env.AI_API_KEY ?? null
  if (provider === 'openai') return env.OPENAI_API_KEY ?? null
  // anthropic / gemini son "dinámicas" — Netlify.env.get directo.
  return Netlify.env.get(PROVIDER_KEY_ENV[provider]) ?? null
}

/**
 * Resolve the API key for a given provider. El canonical env var se
 * intenta primero; AI_API_KEY actúa de fallback para non-deepseek
 * providers (DeepSeek YA usa AI_API_KEY como canonical).
 *
 * Nota O1: las provider keys (ANTHROPIC_API_KEY / GEMINI_API_KEY) son
 * "dinámicas" desde la perspectiva del schema env.ts (construidas en
 * runtime a partir de PROVIDER_KEY_ENV). Por eso seguimos leyendo con
 * Netlify.env.get directo para ESAS dos; el resto (AI_API_KEY,
 * OPENAI_API_KEY, AI_PROVIDER) sí pasan por el schema tipado.
 */
export function readApiKeyFor(provider: LLMProvider): string {
  const canonical = PROVIDER_KEY_ENV[provider]
  const env = getEnv()
  // AI_API_KEY y OPENAI_API_KEY están en el schema; las leemos tipadas.
  // ANTHROPIC_API_KEY / GEMINI_API_KEY son "dinámicas" — caen al
  // Netlify.env.get directo.
  const specific =
    canonical === 'AI_API_KEY'
      ? env.AI_API_KEY
      : canonical === 'OPENAI_API_KEY'
        ? env.OPENAI_API_KEY
        : Netlify.env.get(canonical)
  if (specific) return specific
  if (provider !== 'deepseek') {
    const fallback = env.AI_API_KEY
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
  const env = getEnv()
  const visionOverride = env.AI_VISION_PROVIDER?.toLowerCase()
  if (visionOverride === 'openai' || visionOverride === 'gemini') {
    // AI_VISION_API_KEY y OPENAI_API_KEY del schema; GEMINI_API_KEY queda
    // como dinámica (Netlify.env.get directo) — ver readApiKeyFor.
    const visionProviderKey =
      visionOverride === 'openai'
        ? env.OPENAI_API_KEY
        : Netlify.env.get(PROVIDER_KEY_ENV[visionOverride])
    const key = env.AI_VISION_API_KEY ?? visionProviderKey ?? env.AI_API_KEY
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
  // O1: getEnv() ya parsea string → number con validación.
  const v = getEnv().AI_MAX_TOKENS
  return typeof v === 'number' && v > 0 ? v : 4096
}

export function readCacheTtlSeconds(): number {
  const v = getEnv().AI_CACHE_TTL_SECONDS
  return typeof v === 'number' && v >= 0 ? v : 600
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
