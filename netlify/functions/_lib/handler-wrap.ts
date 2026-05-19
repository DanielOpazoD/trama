/**
 * Wraps a function handler so any uncaught exception is logged to error_log
 * and returned as a 500. Removes boilerplate try/catch from every function file.
 */

import type { Context } from '@netlify/functions'
import { persistError, safeSql } from './observability'

type Handler = (req: Request, context: Context) => Promise<Response>

export function withObservability(functionName: string, handler: Handler): Handler {
  return async (req, context) => {
    const start = Date.now()
    const url = new URL(req.url)
    try {
      const response = await handler(req, context)
      // Log non-2xx responses too, but at warn level (no stack).
      if (response.status >= 400) {
        const body = await response.clone().text().catch(() => '')
        persistError(safeSql(), {
          functionName,
          httpMethod: req.method,
          httpPath: url.pathname,
          statusCode: response.status,
          message: `non-2xx response: ${body.slice(0, 500)}`,
        })
      }
      return response
    } catch (err) {
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
      })
      return new Response(`Server error: ${message}`, { status: 500 })
    }
  }
}
