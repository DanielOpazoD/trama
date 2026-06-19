import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, setupMockSql } from './test-utils'

// Mockeamos db ANTES de importar handler-wrap (que importa observability,
// que importa db). Sin esto, getSql() rompe en test runtime.
vi.mock('./db.js', () => setupMockSql())

import { withObservability } from './handler-wrap'
import { ApiErrors } from './api-error'
import { UnauthenticatedError } from './auth'

describe('withObservability', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // Silenciamos stderr — handler-wrap loguea a través de
    // logErrorEvent (console.error) cuando hay 4xx/5xx.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    consoleErrorSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })

  it('inyecta requestId al handler y lo expone como header x-request-id', async () => {
    let receivedRequestId: string | undefined
    const wrapped = withObservability('test-fn', async (_req, _ctx, opts) => {
      receivedRequestId = opts.requestId
      return new Response('ok')
    })
    const res = await wrapped(new Request('http://localhost/api/test'), mockContext())
    expect(receivedRequestId).toBeTruthy()
    expect(res.headers.get('x-request-id')).toBe(receivedRequestId)
  })

  it('respeta x-request-id entrante (en vez de generar uno nuevo)', async () => {
    const wrapped = withObservability('test-fn', async (_req, _ctx, opts) => {
      return new Response(opts.requestId)
    })
    const res = await wrapped(
      new Request('http://localhost/api/test', {
        headers: { 'x-request-id': 'inbound-trace-id' },
      }),
      mockContext(),
    )
    expect(res.headers.get('x-request-id')).toBe('inbound-trace-id')
    expect(await res.text()).toBe('inbound-trace-id')
  })

  it('preserva el x-request-id si el handler ya lo había seteado (ApiErrors)', async () => {
    const wrapped = withObservability('test-fn', async (_req, _ctx, opts) => {
      return ApiErrors.validation(opts.requestId, 'bad input')
    })
    const res = await wrapped(new Request('http://localhost/api/test'), mockContext())
    // ApiErrors mete el requestId en el header del Response. handler-wrap
    // detecta que ya existe y no lo pisa.
    expect(res.status).toBe(400)
    expect(res.headers.get('x-request-id')).toBeTruthy()
  })

  it('captura excepciones y devuelve 500 con shape canónico INTERNAL', async () => {
    const wrapped = withObservability('test-fn', async () => {
      throw new Error('boom')
    })
    const res = await wrapped(new Request('http://localhost/api/test'), mockContext())
    expect(res.status).toBe(500)
    expect(res.headers.get('content-type')).toMatch(/json/i)
    expect(res.headers.get('x-request-id')).toBeTruthy()
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL')
    expect(body.error.message).toBe('Error interno del servidor')
    expect(body.error.requestId).toBe(res.headers.get('x-request-id'))
  })

  it('mapea UnauthenticatedError a ApiErrors.unauthenticated (401)', async () => {
    const wrapped = withObservability('test-fn', async () => {
      throw new UnauthenticatedError()
    })
    const res = await wrapped(new Request('http://localhost/api/test'), mockContext())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error.code).toBe('UNAUTHENTICATED')
  })

  it('emite evento operacional auth.denied cuando la request queda sin auth', async () => {
    const wrapped = withObservability('test-fn', async () => {
      throw new UnauthenticatedError()
    })

    await wrapped(
      new Request('http://localhost/api/test?token=secret', {
        headers: { 'x-request-id': 'rid-denied' },
      }),
      mockContext(),
    )

    const logs = consoleLogSpy.mock.calls.map((call) => JSON.parse(call[0] as string))
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'auth.denied',
          category: 'operational',
          severity: 'warn',
          requestId: 'rid-denied',
          method: 'GET',
          path: '/api/test',
          reason: 'unauthenticated',
        }),
      ]),
    )
    expect(JSON.stringify(logs)).not.toContain('secret')
  })

  it('logea non-2xx responses (4xx también) a stderr', async () => {
    const wrapped = withObservability('test-fn', async (_req, _ctx, opts) => {
      return ApiErrors.notFound(opts.requestId, 'no encontrado')
    })
    await wrapped(new Request('http://localhost/api/test'), mockContext())
    // logErrorEvent salió por console.error con event 'error'.
    expect(consoleErrorSpy).toHaveBeenCalled()
    const log = JSON.parse(consoleErrorSpy.mock.calls[0]![0] as string)
    expect(log.event).toBe('error')
    expect(log.function).toBe('test-fn')
    expect(log.status).toBe(404)
  })

  it('redacta cuerpos sensibles cuando logea responses non-2xx', async () => {
    const wrapped = withObservability('test-fn', async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'BAD_REQUEST',
            message: 'no guardar Bearer jwt-secret-token',
            details: {
              body: 'texto privado de una nota',
              password: 'clave-super-secreta',
            },
          },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    })

    await wrapped(new Request('http://localhost/api/test'), mockContext())

    expect(consoleErrorSpy).toHaveBeenCalled()
    const raw = consoleErrorSpy.mock.calls[0]![0] as string
    expect(raw).not.toContain('jwt-secret-token')
    expect(raw).not.toContain('texto privado')
    expect(raw).not.toContain('clave-super-secreta')
    const log = JSON.parse(raw)
    expect(log.message).toContain('Bearer [redacted]')
    expect(log.message).toContain('[redacted]')
  })

  it('logea errores JSON canónicos como code/message/requestId sin serializar details', async () => {
    const wrapped = withObservability('test-fn', async (_req, _ctx, opts) => {
      return new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION',
            message: 'Dato inválido',
            requestId: opts.requestId,
            details: {
              body: 'texto privado de una nota',
              password: 'clave-super-secreta',
            },
          },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      )
    })

    await wrapped(new Request('http://localhost/api/test'), mockContext())

    expect(consoleErrorSpy).toHaveBeenCalled()
    const raw = consoleErrorSpy.mock.calls[0]![0] as string
    expect(raw).not.toContain('details')
    expect(raw).not.toContain('texto privado')
    expect(raw).not.toContain('clave-super-secreta')
    const log = JSON.parse(raw)
    expect(log.message).toBe(
      `non-2xx response: ${JSON.stringify({
        error: {
          code: 'VALIDATION',
          message: 'Dato inválido',
          requestId: log.requestId,
        },
      })}`,
    )
  })

  it('responses 2xx NO disparan persistError', async () => {
    const wrapped = withObservability('test-fn', async () => new Response('ok'))
    await wrapped(new Request('http://localhost/api/test'), mockContext())
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })
})
