import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { emptyState, mockBackend } from './fixtures'

const ISO = '2026-06-01T12:00:00.000Z'

type PromptRow = {
  id: string
  title: string
  content: string
  collection: string | null
  tags: string[]
  variables: string[]
  favorite: boolean
  use_count: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

type AttachmentRow = {
  id: string
  owner_type: 'note' | 'prompt'
  owner_id: string
  file_name: string
  mime_type: string
  byte_size: number
  storage_key: string
  created_at: string
  updated_at: string
}

function multipartField(body: string, name: string): string {
  const match = body.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`))
  return match?.[1] ?? ''
}

function multipartFile(body: string): {
  fileName: string
  mimeType: string
  text: string
} {
  const fileName = body.match(/name="file"; filename="([^"]+)"/)?.[1] ?? 'archivo'
  const mimeType =
    body.match(/Content-Type: ([^\r\n]+)/)?.[1] ?? 'application/octet-stream'
  const escapedName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const filePart = body.match(
    new RegExp(
      `name="file"; filename="${escapedName}"\\r\\nContent-Type: [^\\r\\n]+\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`,
    ),
  )
  const text = filePart?.[1] ?? ''
  return { fileName, mimeType, text }
}

test('mundo notas: prompt con anexo sube, lista y descarga archivo privado', async ({
  page,
}) => {
  await mockBackend(page, emptyState())

  const prompts: PromptRow[] = []
  const attachments: AttachmentRow[] = []
  const blobs = new Map<string, { text: string; mimeType: string; fileName: string }>()

  await page.route(
    (url) => url.pathname === '/api/prompts',
    async (route) => {
      if (route.request().method() === 'POST') {
        const payload = JSON.parse(route.request().postData() ?? '{}') as {
          title: string
          content: string
          collection?: string | null
        }
        const row: PromptRow = {
          id: 'prompt-e2e',
          title: payload.title,
          content: payload.content,
          collection: payload.collection ?? null,
          tags: [],
          variables: [],
          favorite: false,
          use_count: 0,
          last_used_at: null,
          created_at: ISO,
          updated_at: ISO,
        }
        prompts.unshift(row)
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(row),
        })
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(prompts),
      })
    },
  )

  await page.route(
    (url) => url.pathname === '/api/notas-attachments',
    async (route) => {
      const url = new URL(route.request().url())
      const ownerType = url.searchParams.get('ownerType')
      const ownerId = url.searchParams.get('ownerId')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          attachments.filter(
            (item) => item.owner_type === ownerType && item.owner_id === ownerId,
          ),
        ),
      })
    },
  )

  await page.route(
    (url) => url.pathname === '/api/notas-attachments-upload',
    async (route) => {
      const body = route.request().postDataBuffer()?.toString('utf8') ?? ''
      expect(multipartField(body, 'encrypted')).toBe('')
      const ownerType = multipartField(body, 'ownerType') as 'prompt'
      const ownerId = multipartField(body, 'ownerId')
      const file = multipartFile(body)
      const storageKey = `user-e2e/${file.fileName}`
      blobs.set(storageKey, file)
      const row: AttachmentRow = {
        id: 'attachment-e2e',
        owner_type: ownerType,
        owner_id: ownerId,
        file_name: file.fileName,
        mime_type: file.mimeType,
        byte_size: Buffer.byteLength(file.text),
        storage_key: storageKey,
        created_at: ISO,
        updated_at: ISO,
      }
      attachments.unshift(row)
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(row),
      })
    },
  )

  await page.route(
    (url) => url.pathname.startsWith('/api/notas-attachments-file/'),
    async (route) => {
      const key = decodeURIComponent(
        new URL(route.request().url()).pathname.replace(
          '/api/notas-attachments-file/',
          '',
        ),
      )
      const blob = blobs.get(key)
      expect(blob).toBeDefined()
      return route.fulfill({
        status: 200,
        contentType: blob?.mimeType ?? 'text/plain',
        headers: { 'Content-Disposition': `attachment; filename="${blob?.fileName}"` },
        body: blob?.text ?? '',
      })
    },
  )

  await page.addInitScript(() => {
    window.localStorage.setItem('trama:world', 'notas')
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Prompts' }).click()
  // El composer vive plegado: el título es la única línea y escribirlo
  // despliega el resto (los aria-labels son estables; el placeholder no).
  await page.getByLabel('Título del prompt').fill('Prompt con anexo')
  await page.getByLabel('Contenido del prompt').fill('Usa el contexto adjunto.')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'brief.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('contexto adjunto privado'),
  })
  await expect(page.getByText('brief.md')).toBeVisible()

  await page.getByRole('button', { name: 'guardar prompt' }).click()

  await expect(page.getByText('Prompt con anexo')).toBeVisible()
  await expect(page.getByRole('button', { name: 'brief.md' })).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'brief.md' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('brief.md')
  const path = await download.path()
  expect(path).toBeTruthy()
  expect(await readFile(path!, 'utf8')).toBe('contexto adjunto privado')
})
