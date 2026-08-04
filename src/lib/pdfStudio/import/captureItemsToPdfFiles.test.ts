import { describe, expect, it, vi } from 'vitest'
import { captureItemsToPdfFiles } from './captureItemsToPdfFiles'
import type { CaptureItem } from '../../../api/notasFeed'
import type { Note } from '../../../api/notes'
import type { Recorte } from '../../../api'

function notaItem(id: string): CaptureItem {
  return { type: 'note', id, note: { id, hasImages: true } as Note } as CaptureItem
}

function recorteItem(id: string, imageKey: string): CaptureItem {
  return {
    type: 'recorte',
    id,
    recorte: { id, images: [], imageKey } as unknown as Recorte,
  } as CaptureItem
}

describe('captureItemsToPdfFiles', () => {
  it('preserva el ORDEN DEL FEED en una selección mixta nota→captura→nota', async () => {
    // Imprenta agrupa imágenes consecutivas en hojas: si el adaptador ordenara
    // por tipo, el PDF no se parecería a lo que el usuario ve seleccionado.
    const listAttachments = vi.fn(async ({ ownerId }: { ownerId: string }) => [
      {
        id: `a-${ownerId}`,
        mimeType: 'image/jpeg',
        fileName: `${ownerId}.jpg`,
        url: `/nota/${ownerId}`,
      } as never,
    ])
    const fetchBlob = vi.fn(async () => new Blob(['x'], { type: 'image/jpeg' }))

    const { files, failures } = await captureItemsToPdfFiles(
      [notaItem('n1'), recorteItem('r1', 'clave-r1'), notaItem('n2')],
      { fetchBlob, listAttachments },
    )

    expect(failures).toEqual([])
    expect(files.map((f) => f.name)).toEqual(['n1.jpg', 'clave-r1.jpg', 'n2.jpg'])
  })
})
