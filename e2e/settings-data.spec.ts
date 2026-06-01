import { expect, test } from '@playwright/test'
import { emptyState, mockBackend } from './fixtures'

const ISO = '2026-05-31T12:00:00.000Z'

type JsonObject = Record<string, unknown>

type BackupPayload = {
  version: 2
  scope: {
    kind: 'structured-core'
    label: string
    includes: string[]
    excludes: string[]
  }
  exportedAt: string
  entities: JsonObject[]
  relationships: JsonObject[]
  quotes: JsonObject[]
  momentos: JsonObject[]
  notes: JsonObject[]
  tasks: JsonObject[]
  blobReferences: string[]
}

function coreExportPayload(): BackupPayload {
  return {
    version: 2,
    scope: {
      kind: 'structured-core',
      label: 'Backup estructurado core',
      includes: [
        'entities',
        'relationships',
        'quotes',
        'momentos',
        'momento_entities',
        'notes',
        'tasks',
        'blob_references',
      ],
      excludes: ['netlify_blobs_binary', 'oauth_tokens'],
    },
    exportedAt: ISO,
    entities: [
      {
        id: 'e-new',
        type: 'persona',
        name: 'Ada Lovelace',
        origin: { kind: 'manual' },
        createdAt: ISO,
        updatedAt: ISO,
      },
    ],
    relationships: [{ id: 'r-new', fromId: 'e-new', toId: 'e-existing', type: 'lee' }],
    quotes: [
      {
        id: 'q-new',
        entityId: 'e-new',
        text: 'La imaginación descubre.',
        linkedQuoteIds: [],
        origin: { kind: 'manual' },
        createdAt: ISO,
        updatedAt: ISO,
      },
    ],
    momentos: [
      {
        id: 'm-new',
        kind: 'foto',
        capturedAt: ISO,
        payload: {
          items: [{ storageKey: 'legacy-single-user/foto.png' }],
          audioKey: 'legacy-single-user/audio.webm',
        },
        origin: { kind: 'manual' },
        entityIds: ['e-new'],
        createdAt: ISO,
        updatedAt: ISO,
      },
    ],
    notes: [
      {
        id: 'n-new',
        content: 'nota #backup',
        tags: ['backup'],
        pinned: false,
        origin: { kind: 'manual' },
        createdAt: ISO,
        updatedAt: ISO,
      },
    ],
    tasks: [
      {
        id: 't-new',
        title: 'verificar export',
        done: false,
        tags: ['backup'],
        origin: { kind: 'manual' },
        createdAt: ISO,
        updatedAt: ISO,
      },
    ],
    blobReferences: ['legacy-single-user/audio.webm', 'legacy-single-user/foto.png'],
  }
}

async function openDataSettings(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: /^Configuración/ }).click()
  await page.getByRole('button', { name: 'Datos' }).click()
  await expect(page.getByRole('heading', { name: 'Datos' })).toBeVisible()
}

async function uploadJsonFile(
  page: import('@playwright/test').Page,
  selector: string,
  name: string,
  payload: unknown,
) {
  await page.locator(selector).evaluate(
    (input, { fileName, json }) => {
      const file = new File([json], fileName, { type: 'application/json' })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      const fileInput = input as HTMLInputElement
      fileInput.files = dataTransfer.files
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
    },
    { fileName: name, json: JSON.stringify(payload) },
  )
}

test('settings datos: export descarga backup estructurado core', async ({ page }) => {
  const state = emptyState()
  await mockBackend(page, state)
  let exportCalled = false
  await page.route(
    (url) => url.pathname === '/api/export',
    async (route) => {
      exportCalled = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Content-Disposition': 'attachment; filename="trama-test.json"' },
        body: JSON.stringify(coreExportPayload()),
      })
    },
  )

  await openDataSettings(page)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar' }).click()
  const download = await downloadPromise

  expect(exportCalled).toBe(true)
  expect(download.suggestedFilename()).toMatch(/^trama-\d{4}-\d{2}-\d{2}\.json$/)
})

test('settings datos: import preview cubre dominios core y confirma payload v2', async ({
  page,
}) => {
  const state = emptyState()
  state.entities.push({
    id: 'e-existing',
    type: 'persona',
    name: 'Existente',
    year: null,
    description: null,
    essay: null,
    position_x: null,
    position_y: null,
    origin: { kind: 'manual' },
    spotify_url: null,
    created_at: ISO,
    updated_at: ISO,
  })
  state.momentos.push({
    id: 'm-existing',
    kind: 'foto',
    captured_at: ISO,
    payload: {},
    note: null,
    origin: { kind: 'manual' },
    entity_ids: [],
    created_at: ISO,
    updated_at: ISO,
  })
  state.notes.push({
    id: 'n-existing',
    content: 'ya existe',
    tags: [],
    pinned: false,
    promoted_momento_id: null,
    created_at: ISO,
    updated_at: ISO,
  })
  state.tasks.push({
    id: 't-existing',
    title: 'ya existe',
    detail: null,
    done: false,
    due_date: null,
    completed_at: null,
    tags: [],
    created_at: ISO,
    updated_at: ISO,
  })
  await mockBackend(page, state)

  let importedPayload: unknown = null
  await page.route(
    (url) => url.pathname === '/api/import',
    async (route) => {
      importedPayload = JSON.parse(route.request().postData() ?? '{}')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ imported: 6, skipped: 3, failed: [] }),
      })
    },
  )

  const payload = coreExportPayload()
  payload.entities.unshift({
    id: 'e-existing',
    type: 'persona',
    name: 'Existente',
    origin: { kind: 'manual' },
    createdAt: ISO,
    updatedAt: ISO,
  })
  payload.momentos.unshift({
    id: 'm-existing',
    kind: 'foto',
    capturedAt: ISO,
    payload: {},
    origin: { kind: 'manual' },
    entityIds: [],
    createdAt: ISO,
    updatedAt: ISO,
  })
  payload.notes.unshift({
    id: 'n-existing',
    content: 'ya existe',
    tags: [],
    pinned: false,
    origin: { kind: 'manual' },
    createdAt: ISO,
    updatedAt: ISO,
  })
  payload.tasks.unshift({
    id: 't-existing',
    title: 'ya existe',
    done: false,
    tags: [],
    origin: { kind: 'manual' },
    createdAt: ISO,
    updatedAt: ISO,
  })

  await openDataSettings(page)
  await uploadJsonFile(
    page,
    'input[type="file"][accept="application/json"]',
    'trama-v2.json',
    payload,
  )

  const preview = page.getByRole('region', { name: /vista previa/i })
  await expect(preview).toBeVisible()
  await expect(preview.getByRole('cell', { name: 'Momentos' })).toBeVisible()
  await expect(preview.getByRole('cell', { name: 'Notas' })).toBeVisible()
  await expect(preview.getByRole('cell', { name: 'Tareas' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Agregar 6 nuevas/i })).toBeVisible()

  await page.getByRole('button', { name: /Agregar 6 nuevas/i }).click()

  await expect.poll(() => importedPayload).not.toBeNull()
  expect(importedPayload).toMatchObject({
    version: 2,
    momentos: expect.arrayContaining([expect.objectContaining({ id: 'm-new' })]),
    notes: expect.arrayContaining([expect.objectContaining({ id: 'n-new' })]),
    tasks: expect.arrayContaining([expect.objectContaining({ id: 't-new' })]),
  })
  await expect(page.getByText('Agregadas 6 entradas a tu trama')).toBeVisible()
})
