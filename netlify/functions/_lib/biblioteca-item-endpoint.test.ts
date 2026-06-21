import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  expectCanonicalError,
  mockContext,
  mockSqlResponses,
  mockSqlState,
  setupMockSql,
} from './test-utils'
import { buildApiRequest } from './test-fixtures'

vi.mock('./db.js', () => setupMockSql())

import handler from '../biblioteca-item'

function overrideRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ov-1',
    item_kind: 'notas-attachment',
    item_id: 'a1',
    display_title: null,
    deleted_at: null,
    updated_at: '2026-06-21T00:00:00.000Z',
    ...overrides,
  }
}

describe('biblioteca-item endpoint — integration (mock SQL)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockSqlResponses.reset()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('PATCH { displayTitle } renombra (upsert) y devuelve el título', async () => {
    mockSqlResponses.push([overrideRow({ display_title: 'Contrato firmado.pdf' })])

    const res = await handler(
      buildApiRequest('/api/biblioteca-item/notas-attachment/a1', {
        method: 'PATCH',
        json: { displayTitle: 'Contrato firmado.pdf' },
      }),
      mockContext({ kind: 'notas-attachment', id: 'a1' }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; title: string }
    expect(body).toMatchObject({ ok: true, title: 'Contrato firmado.pdf' })

    const call = mockSqlState.calls.at(-1)
    expect(call?.template).toMatch(/INSERT INTO library_item_overrides/i)
    expect(call?.values).toContain('legacy-single-user')
  })

  it('PATCH { deleted: true } manda a la papelera', async () => {
    mockSqlResponses.push([overrideRow({ deleted_at: '2026-06-21T10:00:00.000Z' })])

    const res = await handler(
      buildApiRequest('/api/biblioteca-item/pdf-saved/p1', {
        method: 'PATCH',
        json: { deleted: true },
      }),
      mockContext({ kind: 'pdf-saved', id: 'p1' }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; deleted: boolean }
    expect(body).toMatchObject({ ok: true, deleted: true })
    expect(mockSqlState.calls.at(-1)?.template).toMatch(/deleted_at/i)
  })

  it('PATCH { deleted: false } restaura', async () => {
    mockSqlResponses.push([overrideRow({ deleted_at: null })])

    const res = await handler(
      buildApiRequest('/api/biblioteca-item/pdf-saved/p1', {
        method: 'PATCH',
        json: { deleted: false },
      }),
      mockContext({ kind: 'pdf-saved', id: 'p1' }),
    )

    expect(res.status).toBe(200)
    expect((await res.json()) as { deleted: boolean }).toMatchObject({ deleted: false })
  })

  it('rechaza kind no permitido con error canónico de validación', async () => {
    const res = await handler(
      buildApiRequest('/api/biblioteca-item/nope/a1', {
        method: 'PATCH',
        json: { displayTitle: 'x' },
        requestId: 'rid-bad-kind',
      }),
      mockContext({ kind: 'nope', id: 'a1' }),
    )

    await expectCanonicalError(res, {
      status: 400,
      code: 'VALIDATION',
      requestId: 'rid-bad-kind',
    })
  })

  it('rechaza body vacío (ni displayTitle ni deleted)', async () => {
    const res = await handler(
      buildApiRequest('/api/biblioteca-item/notas-attachment/a1', {
        method: 'PATCH',
        json: {},
        requestId: 'rid-empty-body',
      }),
      mockContext({ kind: 'notas-attachment', id: 'a1' }),
    )

    await expectCanonicalError(res, {
      status: 400,
      code: 'VALIDATION',
      requestId: 'rid-empty-body',
    })
  })

  it('rechaza título vacío', async () => {
    const res = await handler(
      buildApiRequest('/api/biblioteca-item/notas-attachment/a1', {
        method: 'PATCH',
        json: { displayTitle: '   ' },
        requestId: 'rid-empty-title',
      }),
      mockContext({ kind: 'notas-attachment', id: 'a1' }),
    )

    await expectCanonicalError(res, {
      status: 400,
      code: 'VALIDATION',
      requestId: 'rid-empty-title',
    })
  })

  it('rechaza métodos no-PATCH con error canónico', async () => {
    const res = await handler(
      buildApiRequest('/api/biblioteca-item/notas-attachment/a1', {
        method: 'DELETE',
        requestId: 'rid-method',
      }),
      mockContext({ kind: 'notas-attachment', id: 'a1' }),
    )

    await expectCanonicalError(res, {
      status: 405,
      code: 'METHOD_NOT_ALLOWED',
      requestId: 'rid-method',
    })
  })
})
