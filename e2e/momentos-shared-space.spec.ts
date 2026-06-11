import { Buffer } from 'node:buffer'
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

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
)

function mediaPath(storageKey: string): string {
  return `/api/momentos-file/${storageKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`
}

function cacheControlDirectives(header: string | undefined): string[] {
  return (header ?? '')
    .split(',')
    .map((directive) => directive.trim().toLowerCase())
    .filter(Boolean)
}

async function findMomento(
  userContext: Awaited<ReturnType<typeof request.newContext>>,
  id: string,
) {
  const timeline = await userContext.get('/api/momentos?limit=100')
  expect(timeline.status()).toBe(200)
  const body = await timeline.json()
  return body.items.find((item: { id: string }) => item.id === id)
}

test.describe('momentos shared space smoke', () => {
  test.skip(
    !hasEnv(),
    'requires E2E_BASE_URL, E2E_USER_A_TOKEN, E2E_USER_B_TOKEN and E2E_USER_B_EMAIL',
  )

  test('user A shares private media with user B using real roles and feedback', async () => {
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
    let inviteeUserId: string | undefined
    let commentId: string | undefined
    let accessRevoked = false

    try {
      const upload = await userA.post('/api/momentos-upload', {
        multipart: {
          file: {
            name: `${marker}.png`,
            mimeType: 'image/png',
            buffer: ONE_PIXEL_PNG,
          },
        },
      })
      expect(upload.status()).toBe(200)
      const uploaded = await upload.json()
      const storageKey = uploaded.storageKey as string
      expect(storageKey).toBeTruthy()

      const aCreate = await userA.post('/api/momentos', {
        data: {
          kind: 'foto',
          note: `${marker} private photo from A`,
          payload: {
            items: [
              {
                storageKey,
                mime: 'image/png',
                caption: `${marker} private photo`,
              },
            ],
          },
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

      const aFileBeforeShare = await userA.get(mediaPath(storageKey))
      expect(aFileBeforeShare.status()).toBe(200)
      expect(cacheControlDirectives(aFileBeforeShare.headers()['cache-control'])).toEqual(
        expect.arrayContaining(['private', 'no-store']),
      )
      expect(aFileBeforeShare.headers().vary).toContain('Authorization')

      const bFileBeforeShare = await userB.get(mediaPath(storageKey))
      expect(bFileBeforeShare.status()).toBe(404)

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
      inviteeUserId = acceptedBody.inviteeUserId
      expect(inviteeUserId).toBeTruthy()

      const bFileAfterShare = await userB.get(mediaPath(storageKey))
      expect(bFileAfterShare.status()).toBe(200)

      const aSeenByB = await findMomento(userB, aMomentoId)
      expect(aSeenByB).toMatchObject({ shared: true, accessRole: 'editor' })
      expect(aSeenByB.ownerUserId).toBeTruthy()
      expect(aSeenByB.ownerUserId).toBe(inviterUserId)

      const bSeenByA = await findMomento(userA, bMomentoId)
      expect(bSeenByA).toMatchObject({ shared: true, accessRole: 'editor' })
      expect(bSeenByA.ownerUserId).toBeTruthy()

      const editAsEditor = await userB.patch(`/api/momentos/${aMomentoId}`, {
        data: { note: `${marker} edited by B as editor` },
      })
      expect(editAsEditor.status()).toBe(200)
      const editedByB = await editAsEditor.json()
      expect(editedByB).toMatchObject({
        id: aMomentoId,
        shared: true,
        access_role: 'editor',
        owner_user_id: inviterUserId,
      })

      const roleChange = await userA.patch(
        `/api/momentos-share-access/${inviteeUserId}`,
        { data: { role: 'viewer' } },
      )
      expect(roleChange.status()).toBe(200)
      expect(await roleChange.json()).toMatchObject({
        userId: inviteeUserId,
        role: 'viewer',
      })

      const aSeenByBAfterRoleChange = await findMomento(userB, aMomentoId)
      expect(aSeenByBAfterRoleChange).toMatchObject({
        shared: true,
        accessRole: 'viewer',
      })

      const editAsViewer = await userB.patch(`/api/momentos/${aMomentoId}`, {
        data: { note: `${marker} forbidden viewer edit` },
      })
      expect(editAsViewer.status()).toBe(404)

      const comment = await userB.post(`/api/momentos-feedback/${aMomentoId}`, {
        data: { body: `${marker} comment from B` },
      })
      expect(comment.status()).toBe(201)
      const commentBody = await comment.json()
      expect(commentBody.comment).toMatchObject({
        authorUserId: inviteeUserId,
        body: `${marker} comment from B`,
        canDelete: true,
      })
      expect(commentBody.comment.createdAt).toBeTruthy()
      commentId = commentBody.comment.id

      const reaction = await userB.put(`/api/momentos-feedback/${aMomentoId}`, {
        data: { reaction: 'heart' },
      })
      expect(reaction.status()).toBe(200)
      expect(await reaction.json()).toMatchObject({
        reaction: { reaction: 'heart', count: 1, reactedByMe: true },
      })

      const feedbackForOwner = await userA.get(`/api/momentos-feedback/${aMomentoId}`)
      expect(feedbackForOwner.status()).toBe(200)
      const ownerFeedback = await feedbackForOwner.json()
      expect(ownerFeedback.comments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: commentId,
            body: `${marker} comment from B`,
            canDelete: true,
          }),
        ]),
      )

      const ownerDeletesComment = await userA.delete(
        `/api/momentos-feedback/${aMomentoId}?commentId=${commentId}`,
      )
      expect(ownerDeletesComment.status()).toBe(200)

      const revoke = await userB.delete(`/api/momentos-share-access/${inviterUserId}`)
      expect(revoke.status()).toBe(200)
      accessRevoked = true

      const bFileAfterRevoke = await userB.get(mediaPath(storageKey))
      expect(bFileAfterRevoke.status()).toBe(404)
    } finally {
      if (inviterUserId && !accessRevoked) {
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
