/**
 * Wraps a function handler so any uncaught exception is logged to error_log
 * and returned as a 500. Removes boilerplate try/catch from every function file.
 *
 * FF1 — además inyecta un `requestId` por request:
 *   - Generado al entrar (UUID v4)
 *   - Pasado al handler como tercer arg (`opts.requestId`)
 *   - Adjuntado a TODAS las responses como header `x-request-id`
 *   - Persistido en `error_log.request_id` cuando algo falla
 *
 * El handler puede aceptar (req, context) — TS permite que funciones con
 * menos parámetros encajen donde se espera una con más. Si necesitás el
 * requestId, declarás el tercer arg explícitamente.
 */

import type { Context } from '@netlify/functions'
import { persistError, safeSql } from './observability'
import { ApiErrors } from './api-error'
import type { ApiErrorBody } from './api-error'
import { UnauthenticatedError } from './auth.js'
import { runWithoutRlsContext } from './user-rls.js'

type NetlifyHandler = (req: Request, context: Context) => Promise<Response>

export type HandlerOpts = { requestId: string }

export type InnerHandler = (
  req: Request,
  context: Context,
  opts: HandlerOpts,
) => Promise<Response>

export function withObservability(
  functionName: string,
  handler: InnerHandler,
): NetlifyHandler {
  return async (req, context) => {
    return runWithoutRlsContext(async () => {
      const start = Date.now()
      const url = new URL(req.url)
      // Si el cliente nos manda un x-request-id (ej. una integración upstream
      // que ya tiene su tracing), lo respetamos. Si no, generamos uno nuevo.
      const requestId = req.headers.get('x-request-id') || crypto.randomUUID()

      try {
        const response = await handler(req, context, { requestId })

        // Garantía: el header `x-request-id` aparece en TODA respuesta. Si
        // el handler ya lo seteó (caso típico cuando devuelve apiError),
        // no lo pisamos.
        const finalResponse = response.headers.has('x-request-id')
          ? response
          : withRequestIdHeader(response, requestId)

        // Log non-2xx responses too (warn level, sin stack).
        if (finalResponse.status >= 400) {
          const body = await finalResponse
            .clone()
            .text()
            .catch(() => '')
          persistError(safeSql(), {
            functionName,
            httpMethod: req.method,
            httpPath: url.pathname,
            statusCode: finalResponse.status,
            message: `non-2xx response: ${body.slice(0, 500)}`,
            requestId,
          })
        }
        return finalResponse
      } catch (err) {
        if (err instanceof UnauthenticatedError) {
          return ApiErrors.unauthenticated(requestId)
        }

        const message = err instanceof Error ? err.message : String(err)
        const stack = err instanceof Error ? err.stack : undefined
        persistError(safeSql(), {
          functionName,
          httpMethod: req.method,
          httpPath: url.pathname,
          statusCode: 500,
          message,
          stack,
          context: { durationMs: Date.now() - start },
          requestId,
        })
        // 500 wrap con shape canónica (ApiErrorBody). El cliente parsea esto
        // exactamente igual que cualquier otro error.
        const body: ApiErrorBody = {
          error: {
            code: 'INTERNAL',
            message: 'Error interno del servidor',
            requestId,
          },
        }
        return new Response(JSON.stringify(body), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'x-request-id': requestId,
          },
        })
      }
    })
  }
}

function withRequestIdHeader(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers)
  headers.set('x-request-id', requestId)
  // `new Headers(response.headers)` puede PERDER los Set-Cookie (no se
  // representan como un header combinable normal). Los re-aplicamos desde el
  // original para no romper flujos que dependen de cookies (p.ej. el OAuth de
  // Spotify setea spotify_state + spotify_uid en /login).
  const cookies = response.headers.getSetCookie?.() ?? []
  if (cookies.length > 0) {
    headers.delete('set-cookie')
    for (const cookie of cookies) headers.append('set-cookie', cookie)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
