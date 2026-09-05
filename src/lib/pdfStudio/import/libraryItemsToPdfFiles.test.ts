import { describe, expect, it, vi } from 'vitest'
import type { LibraryItem } from '../../../types/biblioteca'
import {
  canSendLibraryItemToImprenta,
  libraryItemsToPdfFiles,
} from './libraryItemsToPdfFiles'

function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'notas-attachment:1',
    kind: 'notas-attachment',
    itemId: '1',
    title: 'foto.png',
    fileType: 'image',
    source: 'subido',
    mimeType: 'image/png',
    byteSize: 1024,
    storageKey: 'user/foto.png',
    storageDomain: 'notas-attachments',
    tags: [],
    pinned: false,
    aiStatus: null,
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
    ...overrides,
  }
}

describe('canSendLibraryItemToImprenta', () => {
  it('acepta imágenes y PDFs servibles', () => {
    expect(canSendLibraryItemToImprenta(item())).toBe(true)
    expect(
      canSendLibraryItemToImprenta(
        item({ fileType: 'pdf', mimeType: 'application/pdf', title: 'doc.pdf' }),
      ),
    ).toBe(true)
  })

  it('rechaza Office/otros aunque sean servibles', () => {
    expect(
      canSendLibraryItemToImprenta(
        item({
          fileType: 'document',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          title: 'carta.docx',
        }),
      ),
    ).toBe(false)
  })

  it('rechaza items sin URL de servir (dominio sin endpoint de blob)', () => {
    expect(
      canSendLibraryItemToImprenta(
        item({
          kind: 'pdf-stamp',
          fileType: 'image',
          mimeType: 'image/png',
          storageDomain: 'pdf-stamp-assets',
          storageKey: null,
        }),
      ),
    ).toBe(false)
  })
})

describe('libraryItemsToPdfFiles', () => {
  it('baja solo los ingeribles y construye File(title, mime)', async () => {
    const fetchBlob = vi.fn(async () => new Blob(['x'], { type: 'image/png' }))

    const result = await libraryItemsToPdfFiles(
      [
        item({ id: 'a', itemId: 'a', title: 'imagen uno.png' }),
        // Office: ingerible=false, se omite (sin tocar fetchBlob).
        item({
          id: 'b',
          itemId: 'b',
          fileType: 'document',
          mimeType: 'text/plain',
          title: 'notas.txt',
        }),
        // PDF guardado: dominio sin endpoint de blob → sin URL → se omite.
        item({
          id: 'c',
          itemId: 'c',
          kind: 'pdf-stamp',
          fileType: 'image',
          mimeType: 'image/png',
          storageDomain: 'pdf-stamp-assets',
          storageKey: null,
        }),
      ],
      { fetchBlob },
    )

    expect(fetchBlob).toHaveBeenCalledTimes(1)
    expect(fetchBlob).toHaveBeenCalledWith('/api/notas-attachments-file/user/foto.png')
    expect(result.files).toHaveLength(1)
    expect(result.files[0]!.name).toBe('imagen uno.png')
    expect(result.files[0]!.type).toBe('image/png')
    expect(result.failures).toEqual([])
  })

  it('registra fallas de descarga sin cancelar el lote', async () => {
    const fetchBlob = vi.fn(async (url: string) => {
      if (url.includes('rota')) throw new Error('HTTP 404')
      return new Blob(['x'], { type: 'image/png' })
    })

    const result = await libraryItemsToPdfFiles(
      [
        item({ id: 'ok', itemId: 'ok', storageKey: 'user/ok.png', title: 'ok.png' }),
        item({
          id: 'bad',
          itemId: 'bad',
          storageKey: 'user/rota.png',
          title: 'rota.png',
        }),
      ],
      { fetchBlob },
    )

    expect(result.files).toHaveLength(1)
    expect(result.files[0]!.name).toBe('ok.png')
    expect(result.failures).toEqual([{ id: 'bad', reason: 'HTTP 404' }])
  })
})
