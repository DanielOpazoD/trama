/**
 * Lightweight rate limiting for serverless functions.
 *
 * Per-function-instance, in-memory. Survives a single invocation chain on the
 * same warm instance. NOT a hard cross-instance limit — a determined attacker
 * can hit cold instances. But for honest mistakes (a runaway script, a typo)
 * it's plenty.
 *
 * Keyed by IP. Reset every `windowMs`.
 */

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

export function clearRateLimitBuckets(): void {
  buckets.clear()
}

/**
 * Check + increment. Returns null if allowed, or a Response (429) if rate-limited.
 */
export function rateLimit(
  req: Request,
  options: {
    max: number       // max requests per window
    windowMs: number  // window size in ms
    key?: string      // optional override (e.g., per-user when authed)
  },
): Response | null {
  const ip =
    options.key ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-nf-client-connection-ip') ??
    'unknown'

  const now = Date.now()
  const bucket = buckets.get(ip)

  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + options.windowMs })
    return null
  }

  bucket.count += 1
  if (bucket.count > options.max) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000)
    return new Response(
      `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
          'X-RateLimit-Limit': String(options.max),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(bucket.resetAt / 1000)),
        },
      },
    )
  }

  return null
}
