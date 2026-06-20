import { logEvent, redactLogValue } from './observability'

export const operationalEventNames = [
  'auth.denied',
  'auth.fallback',
  'auth.verified',
  'blob.access.denied',
  'mutation.created',
  'mutation.deleted',
  'owner.mismatch',
  'smoke.failed',
  'smoke.passed',
] as const

export type OperationalEventName = (typeof operationalEventNames)[number]
export type OperationalSeverity = 'info' | 'warn' | 'error'

export type OperationalRequestContext = {
  requestId: string
  method: string
  path: string
  operation?: string
  userId?: string
}

export type OperationalEventPayload = Partial<OperationalRequestContext> & {
  event: OperationalEventName
  severity: OperationalSeverity
  reason?: string
  status?: number
  details?: Record<string, unknown>
}

export function buildOperationalRequestContext(
  request: Request,
  opts: {
    requestId?: string
    operation?: string
    userId?: string
  } = {},
): OperationalRequestContext {
  const url = new URL(request.url)
  return {
    requestId:
      opts.requestId ?? request.headers.get('x-request-id') ?? crypto.randomUUID(),
    method: request.method,
    path: url.pathname,
    ...(opts.operation ? { operation: opts.operation } : {}),
    ...(opts.userId ? { userId: opts.userId } : {}),
  }
}

export function logOperationalEvent(payload: OperationalEventPayload): void {
  logEvent({
    category: 'operational',
    ...payload,
    details: payload.details
      ? (redactLogValue(payload.details) as Record<string, unknown>)
      : undefined,
  })
}
