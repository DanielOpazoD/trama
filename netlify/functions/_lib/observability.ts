/**
 * Structured logging + persistent error log.
 *
 * Two channels:
 *  - `logEvent`: writes a JSON line to stdout, captured by Netlify Functions logs.
 *    Cheap, ephemeral, good for "what happened" timelines.
 *  - `logError`: persists to the error_log table. Survives log rotation; queryable.
 *    Best-effort: failures here never throw.
 *
 * Both are non-blocking. Use them generously without performance fear.
 */

import { getSql } from './db.js'

type SqlClient = ReturnType<typeof getSql>

type LogPayload = {
  event: string
  [key: string]: unknown
}

export function logEvent(payload: LogPayload): void {
  // Structured JSON line so log aggregators can parse it.
  console.log(JSON.stringify({ ...payload, ts: new Date().toISOString() }))
}

export function logErrorEvent(payload: LogPayload & { message: string }): void {
  console.error(JSON.stringify({ ...payload, ts: new Date().toISOString() }))
}

export type ErrorContext = {
  functionName: string
  httpMethod?: string
  httpPath?: string
  statusCode?: number
  message: string
  stack?: string
  context?: Record<string, unknown>
}

/**
 * Persist an error to the error_log table. Best-effort: catches its own failures
 * to avoid creating an error in the error handler.
 */
export function persistError(sql: SqlClient | null, error: ErrorContext): void {
  // Always log to stdout first; that's the cheap path.
  logErrorEvent({
    event: 'error',
    function: error.functionName,
    method: error.httpMethod,
    path: error.httpPath,
    status: error.statusCode,
    message: error.message,
  })

  if (!sql) return

  // Fire-and-forget INSERT. Don't await; don't surface errors.
  void sql`
    INSERT INTO error_log (function_name, http_method, http_path, status_code, message, stack, context)
    VALUES (
      ${error.functionName},
      ${error.httpMethod ?? null},
      ${error.httpPath ?? null},
      ${error.statusCode ?? null},
      ${error.message},
      ${error.stack ?? null},
      ${error.context ? JSON.stringify(error.context) : null}::jsonb
    )
  `.catch(() => {
    // Logging the error logger's failure would be ironic. Just swallow.
  })
}

/**
 * Convenience: returns a SQL client if the Netlify Database is wired up, else null.
 * Useful for error handlers that may run BEFORE the DB connection is needed.
 */
export function safeSql(): SqlClient | null {
  try {
    return getSql()
  } catch {
    return null
  }
}
