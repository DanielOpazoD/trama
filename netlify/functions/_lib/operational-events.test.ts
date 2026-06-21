import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildOperationalRequestContext,
  logOperationalEvent,
  operationalEventNames,
} from './operational-events'

describe('operational events', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('declara el vocabulario operacional multiusuario permitido', () => {
    expect(operationalEventNames).toEqual([
      'auth.denied',
      'auth.fallback',
      'auth.verified',
      'blob.access.denied',
      'mutation.created',
      'mutation.deleted',
      'owner.mismatch',
      'smoke.failed',
      'smoke.passed',
      'storage.manifest.failed',
    ])
  })

  it('construye contexto de request sin querystring ni secretos', () => {
    const request = new Request(
      'https://trama.example/api/recortes?search=nota%20privada&token=secret',
      {
        method: 'DELETE',
        headers: {
          authorization: 'Bearer jwt-private-token',
          cookie: 'session=secret',
          'x-request-id': 'rid-client',
        },
      },
    )

    const context = buildOperationalRequestContext(request, {
      operation: 'recorte.delete',
      userId: 'user_a',
    })

    expect(context).toEqual({
      method: 'DELETE',
      operation: 'recorte.delete',
      path: '/api/recortes',
      requestId: 'rid-client',
      userId: 'user_a',
    })
    expect(JSON.stringify(context)).not.toContain('nota privada')
    expect(JSON.stringify(context)).not.toContain('jwt-private-token')
    expect(JSON.stringify(context)).not.toContain('session=secret')
  })

  it('logea eventos estructurados redactando payload sensible', () => {
    logOperationalEvent({
      event: 'auth.denied',
      severity: 'warn',
      requestId: 'rid-auth',
      path: '/api/notes',
      method: 'GET',
      reason: 'missing_token',
      details: {
        authorization: 'Bearer jwt-secret-token',
        body: 'contenido privado de nota',
        email: 'daniel@example.com',
      },
    })

    const raw = consoleLogSpy.mock.calls[0]![0] as string
    expect(raw).not.toContain('jwt-secret-token')
    expect(raw).not.toContain('contenido privado')
    expect(raw).not.toContain('daniel@example.com')
    const payload = JSON.parse(raw)
    expect(payload).toMatchObject({
      event: 'auth.denied',
      category: 'operational',
      severity: 'warn',
      requestId: 'rid-auth',
      path: '/api/notes',
      method: 'GET',
      reason: 'missing_token',
    })
    expect(payload.details.authorization).toBe('[redacted]')
    expect(payload.details.body).toBe('[redacted]')
    expect(payload.details.email).toBe('[redacted]')
  })
})
