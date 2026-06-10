import { expect, request, test } from '@playwright/test'

const REQUIRED_ENV = [
  'E2E_BASE_URL',
  'E2E_USER_A_TOKEN',
  'E2E_USER_B_TOKEN',
  'E2E_USER_B_EMAIL',
] as const

function hasEnv(): boolean {
  return REQUIRED_ENV.every((key) => Boolean(process.env[key]))
}

test.describe('momentos shared space smoke', () => {
  test.skip(
    !hasEnv(),
    'requires E2E_BASE_URL, E2E_USER_A_TOKEN, E2E_USER_B_TOKEN and E2E_USER_B_EMAIL',
  )

  test('user A invites user B and both timelines show shared authorship', async () => {
    const baseURL = process.env.E2E_BASE_URL!
    const marker = `shared-space-${Date.now()}`
    const userA = await request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${process.env.E2E_USER_A_TOKEN!}` },
    })
    const userB = await request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${process.env.E2E_USER_B_TOKEN!}` },
    })

    let aMomentoId: string | undefined
    let bMomentoId: string | undefined
    let inviterUserId: string | undefined

    try {
      const aCreate = await userA.post('/api/momentos', {
        data: {
          kind: 'nota',
          payload: { bodyText: `${marker} from A` },
          origin: { kind: 'manual' },
        },
      })
      expect(aCreate.status()).toBe(201)
      aMomentoId = (await aCreate.json()).id

      const bCreate = await userB.post('/api/momentos', {
        data: {
          kind: 'nota',
          payload: { bodyText: `${marker} from B` },
          origin: { kind: 'manual' },
        },
      })
      expect(bCreate.status()).toBe(201)
      bMomentoId = (await bCreate.json()).id

      const invite = await userA.post('/api/momentos-share-invitations', {
        data: {
          email: process.env.E2E_USER_B_EMAIL!,
          role: 'editor',
        },
      })
      expect(invite.status()).toBe(201)
      const createdInvitation = await invite.json()

      const pending = await userB.get('/api/momentos-share-invitations')
      expect(pending.status()).toBe(200)
      const pendingBody = await pending.json()
      expect(JSON.stringify(pendingBody)).toContain(createdInvitation.id)

      const accepted = await userB.patch(
        `/api/momentos-share-invitations/${createdInvitation.id}`,
        { data: { action: 'accept' } },
      )
      expect(accepted.status()).toBe(200)
      const acceptedBody = await accepted.json()
      inviterUserId = acceptedBody.inviterUserId

      const bTimeline = await userB.get('/api/momentos?limit=100')
      expect(bTimeline.status()).toBe(200)
      const bItems = (await bTimeline.json()).items
      const aSeenByB = bItems.find((item: { id: string }) => item.id === aMomentoId)
      expect(aSeenByB).toMatchObject({ shared: true, accessRole: 'editor' })
      expect(aSeenByB.ownerUserId).toBeTruthy()

      const aTimeline = await userA.get('/api/momentos?limit=100')
      expect(aTimeline.status()).toBe(200)
      const aItems = (await aTimeline.json()).items
      const bSeenByA = aItems.find((item: { id: string }) => item.id === bMomentoId)
      expect(bSeenByA).toMatchObject({ shared: true, accessRole: 'editor' })
      expect(bSeenByA.ownerUserId).toBeTruthy()
    } finally {
      if (inviterUserId) {
        await userB
          .delete(`/api/momentos-share-access/${inviterUserId}`)
          .catch(() => undefined)
      }
      if (aMomentoId)
        await userA.delete(`/api/momentos/${aMomentoId}`).catch(() => undefined)
      if (bMomentoId)
        await userB.delete(`/api/momentos/${bMomentoId}`).catch(() => undefined)
      await userA.dispose()
      await userB.dispose()
    }
  })
})
