import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logEvent, logErrorEvent, persistError, redactLogValue } from './observability'

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

    it('redacta secretos y contenido sensible antes de escribir logs estructurados', () => {
      logEvent({
        event: 'test_event',
        authorization: 'Bearer jwt-private-token',
        context: {
          body: 'mi nota privada con trauma',
          url: '/api/notes',
          nested: { apiKey: 'sk_proj_private' },
        },
      })

      const raw = consoleLogSpy.mock.calls[0]![0] as string
      expect(raw).not.toContain('jwt-private-token')
      expect(raw).not.toContain('mi nota privada')
      expect(raw).not.toContain('sk_proj_private')
      const payload = JSON.parse(raw)
      expect(payload.authorization).toBe('[redacted]')
      expect(payload.context.body).toBe('[redacted]')
      expect(payload.context.nested.apiKey).toBe('[redacted]')
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

    it('redacta tokens incrustados en mensajes de error', () => {
      logErrorEvent({
        event: 'oops',
        message: 'falló Authorization: Bearer jwt-secret-token',
        token: 'trama_pat_secret',
      })

      const raw = consoleErrorSpy.mock.calls[0]![0] as string
      expect(raw).not.toContain('jwt-secret-token')
      expect(raw).not.toContain('trama_pat_secret')
      const payload = JSON.parse(raw)
      expect(payload.message).toBe('falló Authorization: Bearer [redacted]')
      expect(payload.token).toBe('[redacted]')
    })
  })

  describe('redactLogValue', () => {
    it('redacta recursivamente sin mutar el payload original', () => {
      const original = {
        message: 'Authorization: Bearer jwt-secret-token',
        context: { cookie: 'session=s3cr3t', safe: 'ok' },
      }

      const redacted = redactLogValue(original) as typeof original

      expect(redacted.message).toBe('Authorization: Bearer [redacted]')
      expect(redacted.context.cookie).toBe('[redacted]')
      expect(redacted.context.safe).toBe('ok')
      expect(original.context.cookie).toBe('session=s3cr3t')
    })

    it('redacta PII común como email y teléfono en claves y strings', () => {
      const redacted = redactLogValue({
        event: 'pii',
        email: 'daniel@example.com',
        phone: '+56912345678',
        message: 'contacto daniel@example.com +56912345678',
        context: {
          authorEmail: 'mama@example.com',
          phoneNumber: '+56 9 8765 4321',
          safe: 'ok',
        },
      }) as {
        email: string
        phone: string
        message: string
        context: { authorEmail: string; phoneNumber: string; safe: string }
      }

      const serialized = JSON.stringify(redacted)
      expect(serialized).not.toContain('daniel@example.com')
      expect(serialized).not.toContain('mama@example.com')
      expect(serialized).not.toContain('+56912345678')
      expect(serialized).not.toContain('+56 9 8765 4321')
      expect(redacted.email).toBe('[redacted]')
      expect(redacted.phone).toBe('[redacted]')
      expect(redacted.context.authorEmail).toBe('[redacted]')
      expect(redacted.context.phoneNumber).toBe('[redacted]')
      expect(redacted.context.safe).toBe('ok')
      expect(redacted.message).toContain('[redacted-email]')
      expect(redacted.message).toContain('[redacted-phone]')
    })

    it('redacta storage keys por nombre de campo para evitar filtrar blobs privados', () => {
      const redacted = redactLogValue({
        event: 'storage',
        storageKey: 'legacy-single-user/private.pdf',
        image_key: 'user_a/photo.webp',
        context: {
          blobKey: 'user_b/audio.webm',
          safeKeyHash:
            'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        },
      }) as {
        storageKey: string
        image_key: string
        context: { blobKey: string; safeKeyHash: string }
      }

      expect(redacted.storageKey).toBe('[redacted]')
      expect(redacted.image_key).toBe('[redacted]')
      expect(redacted.context.blobKey).toBe('[redacted]')
      expect(redacted.context.safeKeyHash).toMatch(/^sha256:/)
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

    it('persiste message, stack y context redactados', () => {
      const calls: Array<{ template: string; values: unknown[] }> = []
      const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
        calls.push({ template: strings.join('?'), values })
        return Promise.resolve([])
      }) as unknown as ReturnType<typeof import('./db.js').getSql>

      persistError(sql, {
        functionName: 'notes',
        message: 'falló Bearer jwt-secret-token',
        stack: 'Error: sk_proj_private',
        context: {
          body: 'texto privado de la nota',
          headers: { cookie: 'session=s3cr3t' },
          requestId: 'rid-safe',
        },
        userId: 'user_abc123',
      })

      const serializedValues = JSON.stringify(calls[0]!.values)
      expect(serializedValues).not.toContain('jwt-secret-token')
      expect(serializedValues).not.toContain('sk_proj_private')
      expect(serializedValues).not.toContain('texto privado')
      expect(serializedValues).not.toContain('s3cr3t')
      expect(serializedValues).toContain('[redacted]')
      expect(serializedValues).toContain('rid-safe')
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
