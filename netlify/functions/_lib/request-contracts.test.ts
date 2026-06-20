import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  parseFormFields,
  parseSearchParams,
  QueryParam,
  readFormData,
  requireMethod,
  requestPath,
} from './request-contracts'

const SearchParams = z.object({
  q: z.preprocess(QueryParam.trimmedString({ max: 80 }).normalize, z.string().max(80)),
  limit: z.preprocess(
    QueryParam.clampedInteger({ defaultValue: 15, min: 1, max: 50 }).normalize,
    z.number().int().min(1).max(50),
  ),
  rerank: z.preprocess(
    QueryParam.boolean({ defaultValue: false }).normalize,
    z.boolean(),
  ),
})

const UploadFields = z.object({
  ownerType: z.enum(['note', 'prompt', 'week', 'task']),
  ownerId: z.string().trim().min(1),
  encrypted: z.preprocess(
    QueryParam.boolean({ defaultValue: false }).normalize,
    z.boolean(),
  ),
})

async function json(response: Response) {
  return response.json() as Promise<{
    error: {
      code: string
      message: string
      requestId: string
      details?: { issues?: Array<{ path: string; message: string }> }
    }
  }>
}

describe('request contracts', () => {
  it('requireMethod devuelve 405 canónico con header Allow', async () => {
    const response = requireMethod(
      new Request('http://localhost/api/search', { method: 'POST' }),
      'rid-method',
      ['GET'],
    )

    expect(response?.status).toBe(405)
    expect(response?.headers.get('Allow')).toBe('GET')
    expect(await json(response!)).toMatchObject({
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Método no permitido. Permitidos: GET',
        requestId: 'rid-method',
      },
    })
  })

  it('requireMethod no interviene cuando el método está permitido', () => {
    const response = requireMethod(
      new Request('http://localhost/api/search', { method: 'GET' }),
      'rid-method',
      ['GET'],
    )

    expect(response).toBeNull()
  })

  it('requestPath centraliza el pathname para logs sin repetir parsing en handlers', () => {
    expect(requestPath(new Request('http://localhost/api/momentos/m1?cursor=abc'))).toBe(
      '/api/momentos/m1',
    )
  })

  it('parseSearchParams normaliza strings, enteros clampados y booleanos', () => {
    const parsed = parseSearchParams(
      new Request('http://localhost/api/search?q=%20memoria%20&limit=999&rerank=true'),
      SearchParams,
      'rid-query',
    )

    expect(parsed).toEqual({
      ok: true,
      data: {
        q: 'memoria',
        limit: 50,
        rerank: true,
      },
    })
  })

  it('parseSearchParams preserva defaults compatibles para query ausente o inválida', () => {
    const parsed = parseSearchParams(
      new Request('http://localhost/api/search?limit=abc'),
      SearchParams,
      'rid-query',
    )

    expect(parsed).toEqual({
      ok: true,
      data: {
        q: '',
        limit: 15,
        rerank: false,
      },
    })
  })

  it('parseSearchParams rechaza duplicados cuando el contrato espera un valor único', async () => {
    const parsed = parseSearchParams(
      new Request('http://localhost/api/search?q=uno&q=dos'),
      SearchParams,
      'rid-query',
    )

    expect(parsed.ok).toBe(false)
    if (parsed.ok) throw new Error('expected invalid query')
    expect(parsed.response.status).toBe(400)
    const body = await json(parsed.response)
    expect(body).toMatchObject({
      error: {
        code: 'VALIDATION',
        message: 'Query params inválidos',
        requestId: 'rid-query',
      },
    })
    expect(body.error.details?.issues?.[0]?.path).toBe('q')
  })

  it('readFormData valida content-type antes de intentar leer el body', async () => {
    const parsed = await readFormData(
      new Request('http://localhost/api/upload', {
        method: 'POST',
        body: JSON.stringify({ ok: true }),
      }),
      'rid-form',
    )

    expect(parsed.ok).toBe(false)
    if (parsed.ok) throw new Error('expected invalid form-data')
    expect(parsed.response.status).toBe(400)
    expect(await json(parsed.response)).toMatchObject({
      error: {
        code: 'VALIDATION',
        message: 'Esperaba multipart/form-data',
        requestId: 'rid-form',
      },
    })
  })

  it('parseFormFields valida campos sin mezclar archivos en el payload Zod', () => {
    const form = new FormData()
    form.set('ownerType', 'note')
    form.set('ownerId', 'n1')
    form.set('encrypted', 'true')
    form.set('file', new File(['privado'], 'nota.txt', { type: 'text/plain' }))

    const parsed = parseFormFields(form, UploadFields, 'rid-form')

    expect(parsed).toEqual({
      ok: true,
      data: {
        ownerType: 'note',
        ownerId: 'n1',
        encrypted: true,
      },
    })
  })

  it('parseFormFields devuelve details por campo y no pierde requestId', async () => {
    const form = new FormData()
    form.set('ownerType', 'unknown')
    form.set('ownerId', '')

    const parsed = parseFormFields(form, UploadFields, 'rid-form')

    expect(parsed.ok).toBe(false)
    if (parsed.ok) throw new Error('expected invalid form fields')
    expect(parsed.response.status).toBe(400)
    const body = await json(parsed.response)
    expect(body.error.requestId).toBe('rid-form')
    expect(body.error.details?.issues?.map((issue) => issue.path)).toEqual([
      'ownerType',
      'ownerId',
    ])
  })
})
