import { expect, request, test } from '@playwright/test'

const REQUIRED_ENV = ['E2E_BASE_URL', 'E2E_USER_A_TOKEN', 'E2E_USER_B_TOKEN'] as const

function hasRequiredEnv(): boolean {
  return REQUIRED_ENV.every((key) => Boolean(process.env[key]))
}

function serialize(value: unknown): string {
  return JSON.stringify(value)
}

test.describe('legacy identity cutover smoke', () => {
  test.skip(
    !hasRequiredEnv(),
    'requires E2E_BASE_URL, E2E_USER_A_TOKEN and E2E_USER_B_TOKEN',
  )

  test('user A creates a note and user B cannot read it', async () => {
    const baseURL = process.env.E2E_BASE_URL!
    const userA = await request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${process.env.E2E_USER_A_TOKEN!}` },
    })
    const userB = await request.newContext({
      baseURL,
      extraHTTPHeaders: { Authorization: `Bearer ${process.env.E2E_USER_B_TOKEN!}` },
    })
    const marker = `legacy-cutover-${Date.now()}`
    let noteId: string | undefined

    try {
      const created = await userA.post('/api/notes', {
        data: { title: marker, content: `${marker} private note` },
      })
      expect(created.status()).toBe(201)
      const note = await created.json()
      noteId = note.id

      const userBNotes = await userB.get(`/api/notes?q=${encodeURIComponent(marker)}`)
      expect(userBNotes.status()).toBe(200)
      expect(serialize(await userBNotes.json())).not.toContain(marker)

      const userBFeed = await userB.get(
        `/api/notas-feed?segment=todo&q=${encodeURIComponent(marker)}&limit=20`,
      )
      expect(userBFeed.status()).toBe(200)
      expect(serialize(await userBFeed.json())).not.toContain(marker)

      const userANotes = await userA.get(`/api/notes?q=${encodeURIComponent(marker)}`)
      expect(userANotes.status()).toBe(200)
      expect(serialize(await userANotes.json())).toContain(marker)
    } finally {
      if (noteId) await userA.delete(`/api/notes/${noteId}`).catch(() => undefined)
      await userA.dispose()
      await userB.dispose()
    }
  })

  test('legacy owner token can still read the historical surface', async () => {
    test.skip(
      !process.env.E2E_LEGACY_OWNER_TOKEN,
      'requires E2E_LEGACY_OWNER_TOKEN for owner compatibility check',
    )

    const owner = await request.newContext({
      baseURL: process.env.E2E_BASE_URL!,
      extraHTTPHeaders: {
        Authorization: `Bearer ${process.env.E2E_LEGACY_OWNER_TOKEN!}`,
      },
    })

    try {
      const notes = await owner.get('/api/notes')
      expect(notes.status()).toBe(200)
      const body = await notes.json()
      if (process.env.E2E_LEGACY_EXPECTED_MARKER) {
        expect(serialize(body)).toContain(process.env.E2E_LEGACY_EXPECTED_MARKER)
      }
    } finally {
      await owner.dispose()
    }
  })
})
