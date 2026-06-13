import { expect, request, test } from '@playwright/test'

const REQUIRED_ENV = ['E2E_BASE_URL', 'E2E_USER_A_TOKEN', 'E2E_USER_B_TOKEN'] as const

function hasIsolationEnv(): boolean {
  return REQUIRED_ENV.every((key) => Boolean(process.env[key]))
}

test.describe('multi-user isolation smoke', () => {
  test.skip(
    !hasIsolationEnv(),
    'requires E2E_BASE_URL, E2E_USER_A_TOKEN and E2E_USER_B_TOKEN',
  )

  test('anonymous requests cannot use the legacy fallback', async () => {
    const anon = await request.newContext({
      baseURL: process.env.E2E_BASE_URL!,
    })

    try {
      const response = await anon.get('/api/entities')
      expect(response.status()).toBe(401)
    } finally {
      await anon.dispose()
    }
  })

  test('user B cannot discover user A entity through list or search APIs', async () => {
    const baseURL = process.env.E2E_BASE_URL!
    const userA = await request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${process.env.E2E_USER_A_TOKEN!}` },
    })
    const userB = await request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${process.env.E2E_USER_B_TOKEN!}` },
    })

    const marker = `isolation-${Date.now()}`
    const create = await userA.post('/api/entities', {
      data: {
        name: marker,
        type: 'concepto',
        description: 'private smoke fixture',
        origin: { kind: 'manual' },
      },
    })
    expect(create.status()).toBe(201)
    const entity = await create.json()

    try {
      const list = await userB.get('/api/entities')
      expect(list.status()).toBe(200)
      expect(JSON.stringify(await list.json())).not.toContain(marker)

      const search = await userB.get(`/api/search?q=${encodeURIComponent(marker)}`)
      expect(search.status()).toBe(200)
      expect(JSON.stringify(await search.json())).not.toContain(marker)
    } finally {
      await userA.delete(`/api/entities/${entity.id}`).catch(() => undefined)
      await userA.dispose()
      await userB.dispose()
    }
  })
})
