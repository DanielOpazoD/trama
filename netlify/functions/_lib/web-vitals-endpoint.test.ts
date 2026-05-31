import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

import handler from '../web-vitals'

describe('web-vitals endpoint', () => {
  const originalClerk = process.env['CLERK_SECRET_KEY']
  const originalFallback = process.env['ALLOW_LEGACY_FALLBACK']

  beforeEach(() => {
    mockSqlResponses.reset()
    delete process.env['CLERK_SECRET_KEY']
    delete process.env['ALLOW_LEGACY_FALLBACK']
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalClerk === undefined) delete process.env['CLERK_SECRET_KEY']
    else process.env['CLERK_SECRET_KEY'] = originalClerk
    if (originalFallback === undefined) delete process.env['ALLOW_LEGACY_FALLBACK']
    else process.env['ALLOW_LEGACY_FALLBACK'] = originalFallback
  })

  function postMetric(): Request {
    return new Request('http://localhost/api/web-vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'LCP',
        value: 1234,
        rating: 'good',
        path: '/inicio',
      }),
    })
  }

  it('sin Clerk persiste con legacy-single-user', async () => {
    mockSqlResponses.push([]) // ensureUserRow
    mockSqlResponses.push([]) // INSERT web_vitals_samples

    const res = await handler(postMetric(), mockContext())

    expect(res.status).toBe(204)
    const insert = mockSqlResponses.calls.find((c) =>
      /INSERT INTO web_vitals_samples/i.test(c.template),
    )
    expect(insert?.values).toContain('legacy-single-user')
  })

  it('con Clerk estricto y sin token no persiste bajo legacy', async () => {
    process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'
    process.env['ALLOW_LEGACY_FALLBACK'] = 'false'

    const res = await handler(postMetric(), mockContext())

    expect(res.status).toBe(204)
    expect(
      mockSqlResponses.calls.some((c) =>
        /INSERT INTO web_vitals_samples/i.test(c.template),
      ),
    ).toBe(false)
  })
})
