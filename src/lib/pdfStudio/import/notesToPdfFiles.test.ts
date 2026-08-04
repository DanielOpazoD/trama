import { describe, expect, it, vi } from 'vitest'
import { canSendNoteToImprenta, notesToPdfFiles } from './notesToPdfFiles'
import type { Note } from '../../../api/notes'
import type { NotasAttachment } from '../../../api/notas-attachments'

function nota(id: string, hasImages = true): Note {
  return { id, hasImages } as Note
}

function anexo(overrides: Partial<NotasAttachment>): NotasAttachment {
  return {
    id: 'a1',
    ownerType: 'note',
    ownerId: 'n1',
    fileName: 'foto.jpg',
    mimeType: 'image/jpeg',
    byteSize: 10,
    storageKey: 'k',
    url: '/api/notas-attachments-file/k',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('notesToPdfFiles', () => {
  it('baja solo las imágenes, en orden nota→anexo, con el mime del anexo', async () => {
    const listAttachments = vi.fn(async ({ ownerId }: { ownerId: string }) =>
      ownerId === 'n1'
        ? [
            anexo({ id: 'a1', fileName: 'uno.jpg', url: '/f/uno' }),
            // Un PDF anexado NO es página de Imprenta por esta vía.
            anexo({
              id: 'a2',
              fileName: 'informe.pdf',
              mimeType: 'application/pdf',
              url: '/f/pdf',
            }),
          ]
        : [
            anexo({
              id: 'a3',
              fileName: 'dos.png',
              mimeType: 'image/png',
              url: '/f/dos',
            }),
          ],
    )
    const fetchBlob = vi.fn(async (url: string) => new Blob([url], { type: '' }))

    const { files, failures } = await notesToPdfFiles([nota('n1'), nota('n2')], {
      fetchBlob,
      listAttachments,
    })

    expect(failures).toEqual([])
    // El orden importa: Imprenta agrupa imágenes consecutivas en hojas.
    expect(files.map((f) => f.name)).toEqual(['uno.jpg', 'dos.png'])
    // Blob sin type → cae al mime que registró el anexo.
    expect(files[1]!.type).toBe('image/png')
    expect(fetchBlob).not.toHaveBeenCalledWith('/f/pdf')
  })

  it('un fallo no aborta: registra y sigue con lo demás', async () => {
    const listAttachments = vi.fn(async ({ ownerId }: { ownerId: string }) => {
      if (ownerId === 'n1') throw new Error('lista caída')
      return [
        anexo({ id: 'a1', url: '/f/rota' }),
        anexo({ id: 'a2', fileName: 'sana.jpg', url: '/f/sana' }),
      ]
    })
    const fetchBlob = vi.fn(async (url: string) => {
      if (url === '/f/rota') throw new Error('404')
      return new Blob(['ok'], { type: 'image/jpeg' })
    })

    const { files, failures } = await notesToPdfFiles([nota('n1'), nota('n2')], {
      fetchBlob,
      listAttachments,
    })

    expect(files.map((f) => f.name)).toEqual(['sana.jpg'])
    expect(failures).toEqual([
      { id: 'n1', reason: 'lista caída' },
      { id: 'n2:a1', reason: '404' },
    ])
  })

  it('canSendNoteToImprenta delega en el flag hasImages del servidor', () => {
    expect(canSendNoteToImprenta(nota('n', true))).toBe(true)
    expect(canSendNoteToImprenta(nota('n', false))).toBe(false)
  })
})
