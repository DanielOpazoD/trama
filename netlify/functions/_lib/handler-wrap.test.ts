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

  beforeEach(() => {
    // Silenciamos stderr — handler-wrap loguea a través de
    // logErrorEvent (console.error) cuando hay 4xx/5xx.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => consoleErrorSpy.mockRestore())

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

  it('responses 2xx NO disparan persistError', async () => {
    const wrapped = withObservability('test-fn', async () => new Response('ok'))
    await wrapped(new Request('http://localhost/api/test'), mockContext())
    expect(consoleErrorSpy).not.toHaveBeenCalled()
  })
})
