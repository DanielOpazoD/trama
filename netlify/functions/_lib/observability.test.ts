import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logEvent, logErrorEvent, persistError } from './observability'

describe('observability', () => {
  describe('logEvent', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })
    afterEach(() => consoleLogSpy.mockRestore())

    it('escribe una línea JSON con event + timestamp', () => {
      logEvent({ event: 'test_event', foo: 'bar' })
      expect(consoleLogSpy).toHaveBeenCalledTimes(1)
      const payload = JSON.parse(consoleLogSpy.mock.calls[0]![0] as string)
      expect(payload.event).toBe('test_event')
      expect(payload.foo).toBe('bar')
      expect(typeof payload.ts).toBe('string')
      // ISO 8601 básico — termina en Z o tiene offset.
      expect(payload.ts).toMatch(/T.*Z$/)
    })
  })

  describe('logErrorEvent', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>
    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => consoleErrorSpy.mockRestore())

    it('escribe a stderr (console.error) con la shape de logEvent', () => {
      logErrorEvent({ event: 'oops', message: 'algo falló', code: 'E_BAD' })
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
      const payload = JSON.parse(consoleErrorSpy.mock.calls[0]![0] as string)
      expect(payload.event).toBe('oops')
      expect(payload.message).toBe('algo falló')
      expect(payload.code).toBe('E_BAD')
    })
  })

  describe('persistError', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>
    const originalClerk = process.env['CLERK_SECRET_KEY']
    const originalFallback = process.env['ALLOW_LEGACY_FALLBACK']
    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      delete process.env['CLERK_SECRET_KEY']
      delete process.env['ALLOW_LEGACY_FALLBACK']
    })
    afterEach(() => {
      consoleErrorSpy.mockRestore()
      if (originalClerk === undefined) delete process.env['CLERK_SECRET_KEY']
      else process.env['CLERK_SECRET_KEY'] = originalClerk
      if (originalFallback === undefined) delete process.env['ALLOW_LEGACY_FALLBACK']
      else process.env['ALLOW_LEGACY_FALLBACK'] = originalFallback
    })

    it('si sql es null, solo logea a stdout (no rompe)', () => {
      expect(() =>
        persistError(null, {
          functionName: 'foo',
          message: 'something',
        }),
      ).not.toThrow()
      // stderr SÍ recibe el log estructurado.
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('sin Clerk, si sql está dado ejecuta INSERT INTO error_log con userId legacy', () => {
      const calls: Array<{ template: string; values: unknown[] }> = []
      const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ template: strings.join('?'), values })
        return Promise.resolve([])
      }) as unknown as ReturnType<typeof import('./db.js').getSql>

      persistError(sql, {
        functionName: 'entities',
        httpMethod: 'POST',
        httpPath: '/api/entities',
        statusCode: 400,
        message: 'invalid body',
        requestId: 'rid-123',
      })
      expect(calls).toHaveLength(1)
      expect(calls[0]!.template).toMatch(/INSERT INTO error_log/i)
      expect(calls[0]!.values).toContain('legacy-single-user')
      // request_id viaja como valor también.
      expect(calls[0]!.values).toContain('rid-123')
    })

    it('con Clerk estricto y sin userId explícito, no persiste bajo legacy', () => {
      process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'
      process.env['ALLOW_LEGACY_FALLBACK'] = 'false'
      const calls: Array<{ template: string; values: unknown[] }> = []
      const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ template: strings.join('?'), values })
        return Promise.resolve([])
      }) as unknown as ReturnType<typeof import('./db.js').getSql>

      persistError(sql, {
        functionName: 'entities',
        message: 'strict unauth',
        requestId: 'rid-strict',
      })

      expect(calls).toHaveLength(0)
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('si se pasa userId explícito, lo usa en el INSERT', () => {
      const calls: Array<{ template: string; values: unknown[] }> = []
      const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ template: strings.join('?'), values })
        return Promise.resolve([])
      }) as unknown as ReturnType<typeof import('./db.js').getSql>

      persistError(sql, {
        functionName: 'entities',
        message: 'oops',
        userId: 'user_abc123',
      })
      expect(calls[0]!.values).toContain('user_abc123')
      expect(calls[0]!.values).not.toContain('legacy-single-user')
    })

    it('un fail del INSERT se traga silencioso (no propaga)', async () => {
      const sql = (() => Promise.reject(new Error('DB caído'))) as unknown as ReturnType<
        typeof import('./db.js').getSql
      >
      // Si rompiera, este test rompería con un unhandled rejection.
      expect(() =>
        persistError(sql, { functionName: 'foo', message: 'msg' }),
      ).not.toThrow()
      // Le damos un tick para que la promesa rechazada corra y se trague.
      await new Promise((r) => setTimeout(r, 0))
    })
  })
})
