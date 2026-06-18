import { type APIResponse, expect, request, test } from '@playwright/test'

const REQUIRED_ENV = ['E2E_BASE_URL', 'E2E_USER_A_TOKEN', 'E2E_USER_B_TOKEN'] as const

function hasIsolationEnv(): boolean {
  return REQUIRED_ENV.every((key) => Boolean(process.env[key]))
}

function serialize(value: unknown): string {
  return JSON.stringify(value)
}

async function expectResponseNotToContain(response: APIResponse, marker: string) {
  expect(response.status()).toBe(200)
  expect(serialize(await response.json())).not.toContain(marker)
}

async function expectResponseToContain(response: APIResponse, marker: string) {
  expect(response.status()).toBe(200)
  expect(serialize(await response.json())).toContain(marker)
}

async function expectPatchBlocked(response: APIResponse) {
  expect([403, 404]).toContain(response.status())
}

async function expectMutationBlocked(response: APIResponse) {
  expect([403, 404]).toContain(response.status())
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

  test('revoked tokens cannot use the API when E2E_REVOKED_TOKEN is provided', async () => {
    test.skip(!process.env.E2E_REVOKED_TOKEN, 'requires E2E_REVOKED_TOKEN')

    const revoked = await request.newContext({
      baseURL: process.env.E2E_BASE_URL!,
      extraHTTPHeaders: { Authorization: `Bearer ${process.env.E2E_REVOKED_TOKEN!}` },
    })

    try {
      const response = await revoked.get('/api/entities')
      expect(response.status()).toBe(401)
    } finally {
      await revoked.dispose()
    }
  })

  test('user B cannot discover user A fixtures across core, Notas and attachments', async () => {
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
    const cleanup: Array<() => Promise<unknown>> = []

    const createEntity = await userA.post('/api/entities', {
      data: {
        name: marker,
        type: 'concepto',
        description: 'private smoke fixture',
        origin: { kind: 'manual' },
      },
    })
    expect(createEntity.status()).toBe(201)
    const entity = await createEntity.json()
    cleanup.push(() => userA.delete(`/api/entities/${entity.id}`))

    const createQuote = await userA.post('/api/quotes', {
      data: {
        entity_id: entity.id,
        text: `${marker} cita privada`,
        origin: { kind: 'manual' },
      },
    })
    expect(createQuote.status()).toBe(201)
    const quote = await createQuote.json()
    cleanup.push(() => userA.delete(`/api/quotes/${quote.id}`))

    const createNote = await userA.post('/api/notes', {
      data: {
        title: marker,
        content: `${marker} nota privada`,
      },
    })
    expect(createNote.status()).toBe(201)
    const note = await createNote.json()
    cleanup.push(() => userA.delete(`/api/notes/${note.id}`))

    const createMomento = await userA.post('/api/momentos', {
      data: {
        kind: 'nota',
        payload: { bodyText: `${marker} momento privado` },
      },
    })
    expect(createMomento.status()).toBe(201)
    const momento = await createMomento.json()
    cleanup.push(() => userA.delete(`/api/momentos/${momento.id}`))

    const upload = await userA.post('/api/notas-attachments-upload', {
      multipart: {
        ownerType: 'note',
        ownerId: note.id,
        encrypted: '0',
        file: {
          name: `${marker}.txt`,
          mimeType: 'text/plain',
          buffer: Buffer.from(`${marker} anexo privado`),
        },
      },
    })
    expect(upload.status()).toBe(201)
    const attachment = await upload.json()
    cleanup.push(() => userA.delete(`/api/notas-attachments/${attachment.id}`))

    try {
      await expectResponseNotToContain(await userB.get('/api/entities'), marker)
      await expectResponseNotToContain(await userB.get('/api/quotes?limit=50'), marker)
      await expectResponseNotToContain(await userB.get('/api/momentos'), marker)
      await expectResponseNotToContain(
        await userB.get(`/api/notes?q=${encodeURIComponent(marker)}`),
        marker,
      )
      await expectResponseNotToContain(
        await userB.get(`/api/search?q=${encodeURIComponent(marker)}`),
        marker,
      )
      await expectResponseNotToContain(
        await userB.get(
          `/api/notas-feed?segment=todo&q=${encodeURIComponent(marker)}&limit=20`,
        ),
        marker,
      )

      const bAttachments = await userB.get(
        `/api/notas-attachments?ownerType=note&ownerId=${encodeURIComponent(note.id)}`,
      )
      expect([403, 404]).toContain(bAttachments.status())

      const bAttachmentFile = await userB.get(
        `/api/notas-attachments-file/${encodeURIComponent(attachment.storage_key)}`,
      )
      expect([403, 404]).toContain(bAttachmentFile.status())

      await expectPatchBlocked(
        await userB.patch(`/api/entities/${entity.id}`, {
          data: { name: `${marker} mutado por B` },
        }),
      )
      await expectMutationBlocked(await userB.delete(`/api/entities/${entity.id}`))
      await expectResponseToContain(await userA.get('/api/entities'), marker)

      await expectPatchBlocked(
        await userB.patch(`/api/quotes/${quote.id}`, {
          data: { text: `${marker} cita mutada por B` },
        }),
      )
      await expectMutationBlocked(await userB.delete(`/api/quotes/${quote.id}`))
      await expectResponseToContain(await userA.get('/api/quotes?limit=50'), marker)

      await expectPatchBlocked(
        await userB.patch(`/api/notes/${note.id}`, {
          data: { content: `${marker} nota mutada por B` },
        }),
      )
      await expectMutationBlocked(await userB.delete(`/api/notes/${note.id}`))
      await expectResponseToContain(
        await userA.get(`/api/notes?q=${encodeURIComponent(marker)}`),
        marker,
      )

      await expectPatchBlocked(
        await userB.patch(`/api/momentos/${momento.id}`, {
          data: { payload: { bodyText: `${marker} momento mutado por B` } },
        }),
      )
      await expectMutationBlocked(await userB.delete(`/api/momentos/${momento.id}`))
      await expectResponseToContain(await userA.get('/api/momentos'), marker)

      await expectMutationBlocked(
        await userB.delete(`/api/notas-attachments/${attachment.id}`),
      )
      const aAttachments = await userA.get(
        `/api/notas-attachments?ownerType=note&ownerId=${encodeURIComponent(note.id)}`,
      )
      await expectResponseToContain(aAttachments, attachment.id)

      const aAttachmentFile = await userA.get(
        `/api/notas-attachments-file/${encodeURIComponent(attachment.storage_key)}`,
      )
      expect(aAttachmentFile.status()).toBe(200)
    } finally {
      for (const cleanupStep of cleanup.reverse()) {
        await cleanupStep().catch(() => undefined)
      }
      await userA.dispose()
      await userB.dispose()
    }
  })
})
