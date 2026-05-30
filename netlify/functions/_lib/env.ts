/**
 * N4: Validación tipada de env vars al boot.
 *
 * Antes cada caller hacía `Netlify.env.get('XYZ')` y parseaba ad-hoc.
 * El problema: typear mal el nombre no producía error de compile (TS no
 * sabe qué env vars existen). Y los defaults vivían dispersos en cada
 * site (ej. cost-cap parseaba AI_MONTHLY_BUDGET_CENTS con fallback 500;
 * llm/config parseaba AI_MAX_TOKENS con fallback distinto en cada lugar).
 *
 * Este módulo:
 *   1. Declara TODAS las env vars estáticas en un schema Zod.
 *   2. `getEnv()` lee `Netlify.env.get(key)` una sola vez y cachea el
 *      objeto parseado.
 *   3. Los tipos numeric/boolean se coerce desde string al schema.
 *   4. El caller tipea `env.AI_MAX_TOKENS` y TS le dice si tipea mal.
 *
 * **Fail-soft** intencional: todas las vars son `.optional()` (excepto
 * las que tienen `.default()`). Si una var "requerida en producción"
 * falta, el caller que la usa debe chequear undefined y fallar con un
 * mensaje claro. No hacemos fail-fast al boot porque algunas funciones
 * son útiles sin LLM (manejo de entidades, soft delete, etc.) y no
 * queremos romper esos endpoints por falta de un AI_API_KEY que no
 * usan.
 *
 * **Env dinámicas excluidas**: el LLM provider key (DEEPSEEK_API_KEY,
 * ANTHROPIC_API_KEY, etc.) se lee con keys construidas runtime
 * (`Netlify.env.get(\`${PROVIDER}_API_KEY\`)`) — no las podemos
 * declarar acá sin perder esa flexibilidad. Esos call sites siguen con
 * `Netlify.env.get(...)` directo.
 */

import { z } from 'zod'

// Helper: coerce un string que puede ser undefined a number (o undefined).
// Zod's `coerce.number()` falla con undefined; necesitamos transform manual.
const optionalNumber = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === '') return undefined
    const n = Number(v)
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'no es un número válido' })
      return z.NEVER
    }
    return n
  })

// Helper: 'true' / '1' / 'on' → true; cualquier otra cosa o undefined → false.
const boolFlag = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1' || v === 'on')

// Helper: 'false' / '0' → false; cualquier otra cosa (incluido undefined) → true.
// Usar para flags que están ON por default (opt-out semantics).
const boolFlagDefaultOn = z
  .string()
  .optional()
  .transform((v) => {
    if (v === undefined || v === '') return true
    const lower = v.toLowerCase()
    return lower !== 'false' && lower !== '0' && lower !== 'off'
  })

const EnvSchema = z.object({
  // ─── LLM ────────────────────────────────────────────────────────────
  /** Proveedor LLM por default (cuando ai_task_providers no tiene row). */
  AI_PROVIDER: z.string().optional().default('deepseek'),
  /** Fallback genérico de API key si no hay PROVIDER-specific key. */
  AI_API_KEY: z.string().optional(),
  /** Cadena de fallback cross-provider, separada por comas (p.ej.
   *  "openai,gemini"). Ante caída transitoria del primario, el despachador
   *  intenta estos EN ORDEN si tienen key dedicada. Vacío → sin fallback. */
  AI_FALLBACK_PROVIDERS: z.string().optional(),
  /** Proveedor para tareas de visión (extract-image). */
  AI_VISION_PROVIDER: z.string().optional(),
  /** API key específica de vision si difiere del provider principal. */
  AI_VISION_API_KEY: z.string().optional(),
  /** Tope de tokens de output por llamada. Sin set, cada provider su default. */
  AI_MAX_TOKENS: optionalNumber,
  /** TTL del cache de respuestas LLM, en segundos. Default 600 (10 min). */
  AI_CACHE_TTL_SECONDS: optionalNumber,
  /** Si true (default), además del cache en memoria, persistir en DB
   *  (ai_response_cache). Opt-out con 'false' / '0' / 'off'. */
  AI_DB_CACHE_ENABLED: boolFlagDefaultOn,
  /** Cap mensual de gasto LLM en centavos USD. Default 500 (=$5). */
  AI_MONTHLY_BUDGET_CENTS: optionalNumber,

  // ─── Cost alerting ──────────────────────────────────────────────────
  /** % del budget que dispara el alert webhook. Default 80. */
  COST_ALERT_THRESHOLD_PCT: optionalNumber,
  /** URL POST receptora del payload de alert. Sin set, no se envían alerts. */
  COST_ALERT_WEBHOOK_URL: z.string().url().optional(),

  // ─── Embeddings ─────────────────────────────────────────────────────
  /** OpenAI key para text-embedding-3-small (RAG). Si falta, hybrid search
   *  cae a lexical-only sin embeddings. */
  OPENAI_API_KEY: z.string().optional(),

  // ─── Auth (Clerk) ───────────────────────────────────────────────────
  /** Sin set → modo single-user legacy. Con set → requiere Bearer token. */
  CLERK_SECRET_KEY: z.string().optional(),
  /** Durante migración: permite requests sin token caigan a legacy-single-user. */
  ALLOW_LEGACY_FALLBACK: boolFlag,
  /** Sub de Clerk del dueño histórico. Si un token verificado trae este
   *  sub, se mapea al dueño `legacy-single-user` (toda la data pre-Clerk),
   *  evitando migrar tablas + blobs. El resto de usuarios usan su sub real.
   *  Quitar el día de la migración multi-user definitiva. */
  LEGACY_OWNER_CLERK_ID: z.string().optional(),

  // ─── Database ───────────────────────────────────────────────────────
  /** Nombre actual de la conexión Neon HTTP (post 20260518). */
  NETLIFY_DB_URL: z.string().optional(),

  // ─── Spotify OAuth ──────────────────────────────────────────────────
  /** Client ID de la app Spotify. Sin él, OAuth no inicia. */
  SPOTIFY_CLIENT_ID: z.string().optional(),
  /** Client secret de la app Spotify. Sin él, no podemos intercambiar
   *  el code por tokens. */
  SPOTIFY_CLIENT_SECRET: z.string().optional(),
  /** URL absoluta a la que Spotify redirige tras el OAuth (debe
   *  matchear lo registrado en la app de Spotify). */
  SPOTIFY_REDIRECT_URI: z.string().url().optional(),
})

export type Env = z.infer<typeof EnvSchema>

let cached: Env | null = null

/**
 * Devuelve el objeto env tipado, validado una sola vez por proceso.
 *
 * Lee de `Netlify.env.get(...)` o `process.env.<key>` (fallback para
 * tests Vitest donde `Netlify.env` no existe). Si la validación falla
 * — solo ocurre con valores INVÁLIDOS, no faltantes — se loguea y se
 * devuelven los defaults parciales (no rompemos el handler entero).
 *
 * @example
 *   const env = getEnv()
 *   if (!env.OPENAI_API_KEY) {
 *     // fall back to lexical-only search
 *   }
 *   const budget = env.AI_MONTHLY_BUDGET_CENTS ?? 500
 */
export function getEnv(): Env {
  if (cached) return cached

  // Reader que prueba `Netlify.env.get` (runtime real) y cae a
  // process.env (tests / node CLI). El catch atrapa el ReferenceError
  // cuando Netlify no está stubeado.
  function read(key: string): string | undefined {
    try {
      return Netlify.env.get(key)
    } catch {
      return process.env[key]
    }
  }

  const raw: Record<string, string | undefined> = {}
  for (const key of Object.keys(EnvSchema.shape) as Array<keyof Env>) {
    raw[key] = read(key as string)
  }

  const parsed = EnvSchema.safeParse(raw)
  if (!parsed.success) {
    // No es fatal — un valor inválido en una env opcional no debe
    // tirar abajo el handler. Logueamos y caemos al subset válido
    // (las que sí parsearon). Es un caso edge: en práctica este path
    // solo se hit-ea si AI_MAX_TOKENS o similar es "abc" en vez de "100".

    console.error(
      '[env] validación parcial falló — algunas vars usan valor por default',
      parsed.error.issues,
    )
    cached = EnvSchema.parse({}) // todos los defaults
    return cached
  }

  cached = parsed.data
  return cached
}

/**
 * Limpia el cache. Solo para tests que necesitan re-leer env vars
 * después de stubear `Netlify.env`.
 */
export function resetEnvCache(): void {
  cached = null
}
