import type { z } from 'zod'
import { ApiErrors } from './api-error.js'

export type ContractResult<T> = { ok: true; data: T } | { ok: false; response: Response }

type QueryIntegerOptions = {
  defaultValue: number
  min: number
  max: number
}

type QueryStringOptions = {
  defaultValue?: string
  max?: number
}

function issueDetails(error: z.ZodError) {
  return {
    issues: error.issues.map((iss) => ({
      path: iss.path.join('.'),
      message: iss.message,
    })),
  }
}

function collectEntries(entries: Iterable<[string, File | string]>) {
  const raw: Record<string, unknown> = {}
  for (const [key, value] of entries) {
    if (typeof File !== 'undefined' && value instanceof File) continue
    const current = raw[key]
    if (current === undefined) {
      raw[key] = value
    } else if (Array.isArray(current)) {
      current.push(value)
    } else {
      raw[key] = [current, value]
    }
  }
  return raw
}

export const QueryParam = {
  trimmedString({ defaultValue = '' }: QueryStringOptions = {}) {
    return {
      normalize: (value: unknown) => {
        if (value === undefined) return defaultValue
        return typeof value === 'string' ? value.trim() : value
      },
    }
  },

  clampedInteger({ defaultValue, min, max }: QueryIntegerOptions) {
    return {
      normalize(value: unknown) {
        if (typeof value !== 'string' || value.trim() === '') return defaultValue
        const parsed = Number.parseInt(value, 10)
        if (!Number.isFinite(parsed)) return defaultValue
        return Math.min(Math.max(parsed, min), max)
      },
    }
  },

  boolean({ defaultValue = false }: { defaultValue?: boolean } = {}) {
    return {
      normalize(value: unknown) {
        if (value === undefined) return defaultValue
        return value === 'true' || value === '1'
      },
    }
  },
}

export function requireMethod(
  req: Request,
  requestId: string,
  allowed: readonly string[],
): Response | null {
  if (allowed.includes(req.method)) return null
  const response = ApiErrors.methodNotAllowed(
    requestId,
    `Método no permitido. Permitidos: ${allowed.join(', ')}`,
  )
  response.headers.set('Allow', allowed.join(', '))
  return response
}

export function parseSearchParams<T>(
  req: Request,
  schema: z.ZodType<T>,
  requestId: string,
): ContractResult<T> {
  const raw = collectEntries(new URL(req.url).searchParams.entries())
  const result = schema.safeParse(raw)
  if (!result.success) {
    return {
      ok: false,
      response: ApiErrors.validation(
        requestId,
        'Query params inválidos',
        issueDetails(result.error),
      ),
    }
  }
  return { ok: true, data: result.data }
}

export async function readFormData(
  req: Request,
  requestId: string,
): Promise<ContractResult<FormData>> {
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return {
      ok: false,
      response: ApiErrors.validation(requestId, 'Esperaba multipart/form-data'),
    }
  }

  try {
    return { ok: true, data: await req.formData() }
  } catch {
    return {
      ok: false,
      response: ApiErrors.validation(requestId, 'form-data inválido'),
    }
  }
}

export function parseFormFields<T>(
  formData: FormData,
  schema: z.ZodType<T>,
  requestId: string,
): ContractResult<T> {
  const result = schema.safeParse(collectEntries(formData.entries()))
  if (!result.success) {
    return {
      ok: false,
      response: ApiErrors.validation(
        requestId,
        'Campos de form-data inválidos',
        issueDetails(result.error),
      ),
    }
  }
  return { ok: true, data: result.data }
}
