import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  buildClientApiInventory,
  checkClientApiContracts,
} from './client-api-contracts.mjs'

function write(root, file, source) {
  const path = join(root, file)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, source)
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'client-api-contracts-'))
  write(
    root,
    'src/api/request.ts',
    'export async function requestBlob() {}\nexport async function apiFetch(url) { return fetch(url, {}) }\n',
  )
  write(
    root,
    'src/lib/libro/buildLibro.ts',
    'export async function f(url) { return fetch(url) }\n',
  )
  write(
    root,
    'src/lib/pdfStudio/assemble/assembleFonts.ts',
    'export async function f(url) { return fetch(url) }\n',
  )
  write(
    root,
    'src/components/recortes/RecorteCard.tsx',
    "import { requestBlob } from '../../api/request'\nasync function f(r) { await requestBlob(recorteImageUrl(r.imageKey)); return fetch(r.imageUrl) }\n",
  )
  write(
    root,
    'src/components/momentos/AuthenticatedMedia.tsx',
    "import { requestBlob } from '../../api/request'\nfunction shouldRetryLegacyMediaWithoutAuth() { return true }\nasync function f(src, signal) { try { return await requestBlob(src, { signal }) } catch { return fetch(src, { signal, headers: {} }) } }\n",
  )
  write(
    root,
    'src/components/notas/pdfStudio/shell/usePdfStudioPageActions.ts',
    'export async function f(bitmap) { return fetch(bitmap.url) }\n',
  )
  write(
    root,
    'src/api/chat.ts',
    "import { apiFetch } from './request'\nfunction messageFromErrorText(text) { return text }\nexport async function f(threadId, handlers) { const response = await apiFetch(`/api/chat/threads/${threadId}/messages`); if (!response.ok || !response.body) { const text = await response.text(); handlers.onError?.(messageFromErrorText(text) || `HTTP ${response.status}`); return } return response.body.getReader() }\n",
  )
  write(
    root,
    'src/api/biblioteca.ts',
    "export async function f(uploadUrl, file) { const putResponse = await fetch(uploadUrl, { method: 'PUT', body: file }); if (!putResponse.ok) throw new Error(`R2 ${putResponse.status}`) }\n",
  )
  write(
    root,
    'src/lib/clientErrorTracking.ts',
    "import { apiFetch } from '../api/request'\nexport function f() { void apiFetch('/api/error-log', { method: 'POST' }) }\n",
  )
  write(
    root,
    'src/lib/webVitals.ts',
    "import { apiFetch } from '../api/request'\nexport function f() { void apiFetch('/api/web-vitals', { method: 'POST' }) }\n",
  )
  write(
    root,
    'src/components/notas/AttachmentsPanel.tsx',
    "import { requestBlob } from '../../api/request'\nasync function f(attachment) { return requestBlob(attachment.url) }\n",
  )
  write(
    root,
    'src/components/notas/AttachmentPhotos.tsx',
    "import { requestBlob } from '../../api/request'\nasync function f(photo) { return requestBlob(photo.url) }\n",
  )
  write(
    root,
    'src/components/momentos/editModal/FotoEditModal.tsx',
    "import { requestBlob } from '../../../api/request'\nasync function f(item) { return requestBlob(momentoMediaUrl(item.storageKey)) }\n",
  )
  write(
    root,
    'src/lib/photoExport.ts',
    "import { requestBlob } from '../api/request'\nasync function fetchBlob(url) { return requestBlob(url) }\n",
  )
  write(
    root,
    'src/lib/pdfStudio/import/recortesToPdfFiles.ts',
    'type Options = { fetchBlob: (url: string) => Promise<Blob> }\nasync function f(fetchBlob, url) { const blob = await fetchBlob(url); return blob }\n',
  )
  write(
    root,
    'src/components/notas/NotasWorld.tsx',
    "import { requestBlob } from '../../api/request'\nrecortesToPdfFiles(recortes, { fetchBlob: requestBlob })\n",
  )
  return root
}

describe('checkClientApiContracts', () => {
  it('acepta solo las excepciones documentadas de fetch directo', () => {
    const result = checkClientApiContracts(createFixture())

    expect(result).toEqual({ ok: true, failures: [] })
  })

  it('rechaza fetch directo en un consumidor nuevo no allowlisteado', () => {
    const root = createFixture()
    write(
      root,
      'src/components/notas/BadDownloader.tsx',
      'export async function f(url) { return fetch(url) }\n',
    )

    const result = checkClientApiContracts(root)

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/components/notas/BadDownloader.tsx',
          message: expect.stringContaining('usa fetch() directo'),
        }),
      ]),
    )
  })

  it('rechaza volver a apiFetch manual en descargas privadas', () => {
    const root = createFixture()
    write(
      root,
      'src/components/notas/AttachmentsPanel.tsx',
      "import { apiFetch } from '../../api/request'\nasync function f(attachment) { return apiFetch(attachment.url) }\n",
    )

    const result = checkClientApiContracts(root)

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/components/notas/AttachmentsPanel.tsx',
          message: expect.stringContaining('requestBlob(attachment.url)'),
        }),
        expect.objectContaining({
          file: 'src/components/notas/AttachmentsPanel.tsx',
          message: expect.stringContaining('apiFetch('),
        }),
      ]),
    )
  })

  it('rechaza apiFetch crudo en consumidores nuevos sin excepción documentada', () => {
    const root = createFixture()
    write(
      root,
      'src/components/notas/BadApiDownloader.tsx',
      "import { apiFetch } from '../../api/request'\nexport async function f(url) { return apiFetch(url) }\n",
    )

    const result = checkClientApiContracts(root)

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/components/notas/BadApiDownloader.tsx',
          message: expect.stringContaining('usa apiFetch() crudo'),
        }),
      ]),
    )
  })

  it('rechaza aumentar el número de fetch directos de una excepción allowlisteada', () => {
    const root = createFixture()
    write(
      root,
      'src/components/recortes/RecorteCard.tsx',
      [
        "import { requestBlob } from '../../api/request'",
        'async function f(r) {',
        '  await requestBlob(recorteImageUrl(r.imageKey))',
        '  await fetch(r.imageUrl)',
        '  return fetch(r.sourceUrl)',
        '}',
        '',
      ].join('\n'),
    )

    const result = checkClientApiContracts(root)

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/components/recortes/RecorteCard.tsx',
          message: expect.stringContaining('pero tiene 2'),
        }),
      ]),
    )
  })

  it('rechaza que el fallback legacy pierda sus markers de seguridad', () => {
    const root = createFixture()
    write(
      root,
      'src/components/momentos/AuthenticatedMedia.tsx',
      [
        "import { requestBlob } from '../../api/request'",
        'async function f(src, signal) {',
        '  try { return await requestBlob(src, { signal }) }',
        '  catch { return fetch(src, { signal }) }',
        '}',
        '',
      ].join('\n'),
    )

    const result = checkClientApiContracts(root)

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/components/momentos/AuthenticatedMedia.tsx',
          message: expect.stringContaining('shouldRetryLegacyMediaWithoutAuth'),
        }),
        expect.objectContaining({
          file: 'src/components/momentos/AuthenticatedMedia.tsx',
          message: expect.stringContaining('headers: {}'),
        }),
      ]),
    )
  })

  it('expone un inventario JSON estable para auditorías de la frontera cliente API', () => {
    const inventory = buildClientApiInventory(createFixture())

    expect(inventory.generatedBy).toBe('scripts/client-api-contracts.mjs')
    expect(inventory.requestExports).toEqual({
      apiFetch: true,
      request: false,
      requestResponse: false,
      requestBlob: true,
      apiClientError: false,
    })
    expect(inventory.summary).toEqual({
      directFetchFiles: 7,
      allowedDirectFetchFiles: 7,
      rawApiFetchFiles: 3,
      allowedRawApiFetchFiles: 3,
      rawResponseUsageFiles: 2,
      allowedRawResponseUsageFiles: 2,
      privateBlobConsumers: 8,
      privateBlobConsumersOk: 8,
    })
    expect(inventory.directFetches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/components/momentos/AuthenticatedMedia.tsx',
          allowed: true,
          reason: 'legacy single-user Momentos fallback only',
          count: 1,
          expectedCount: 1,
        }),
      ]),
    )
    expect(inventory.privateBlobConsumers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/lib/pdfStudio/import/recortesToPdfFiles.ts',
          ok: true,
          missingRequired: [],
          presentForbidden: [],
        }),
      ]),
    )
    expect(inventory.rawApiFetches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/api/chat.ts',
          allowed: true,
          reason: 'streaming chat response',
          count: 1,
          expectedCount: 1,
        }),
      ]),
    )
  })

  it('marca consumidores privados incompletos en el inventario aunque no tengan fetch directo', () => {
    const root = createFixture()
    write(
      root,
      'src/lib/photoExport.ts',
      'export async function fetchBlob(url) { throw new Error(url) }\n',
    )

    const inventory = buildClientApiInventory(root)

    expect(inventory.privateBlobConsumers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/lib/photoExport.ts',
          ok: false,
          missingRequired: ['requestBlob(url)'],
        }),
      ]),
    )
  })

  it('rechaza parsear Response manualmente en un nuevo módulo src/api sin excepción', () => {
    const root = createFixture()
    write(
      root,
      'src/api/badManual.ts',
      "import { requestResponse } from './request'\nexport async function f() { const response = await requestResponse('/api/bad'); if (!response.ok) return response.text(); return response.json() }\n",
    )

    const result = checkClientApiContracts(root)

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/api/badManual.ts',
          message: expect.stringContaining('parsea Response manualmente'),
        }),
      ]),
    )
  })

  it('rechaza que una excepción de Response crudo crezca sin actualizar el contrato', () => {
    const root = createFixture()
    write(
      root,
      'src/api/biblioteca.ts',
      [
        'export async function f(uploadUrl, file, secondUrl) {',
        "  const putResponse = await fetch(uploadUrl, { method: 'PUT', body: file })",
        '  if (!putResponse.ok) throw new Error(`R2 ${putResponse.status}`)',
        "  const secondResponse = await fetch(secondUrl, { method: 'PUT', body: file })",
        '  if (!secondResponse.ok) throw new Error(`R2 ${secondResponse.status}`)',
        '}',
        '',
      ].join('\n'),
    )

    const result = checkClientApiContracts(root)

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'src/api/biblioteca.ts',
          message: expect.stringContaining('Response crudo(s) permitidos'),
        }),
      ]),
    )
  })
})
