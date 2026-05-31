import { describe, expect, it, vi } from 'vitest'
import { mockContext, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())
vi.mock('./cost-cap.js', () => ({ checkMonthlyBudget: vi.fn(async () => null) }))
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn().mockResolvedValue({ sub: 'user_suggest_xyz' }),
}))

process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'

import handler from '../suggest-relationships'

describe('suggest-relationships endpoint body contract', () => {
  it('rechaza avoidPrevious mal formado con ApiErrors.validation', async () => {
    const res = await handler(
      new Request('http://localhost/api/suggest-relationships', {
        method: 'POST',
        headers: {
          authorization: 'Bearer xyz-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          avoidPrevious: [{ fromName: '', toName: 'B', type: 'x' }],
        }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; details?: unknown } }
    expect(body.error.code).toBe('VALIDATION')
  })
})
