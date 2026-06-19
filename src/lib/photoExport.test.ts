import { afterEach, describe, expect, it, vi } from 'vitest'

const requestMocks = vi.hoisted(() => ({
  requestBlob: vi.fn(async () => new Blob(['img'], { type: 'image/jpeg' })),
}))

const downloadMocks = vi.hoisted(() => ({
  downloadBlob: vi.fn(),
}))

vi.mock('../api/request', () => ({
  requestBlob: requestMocks.requestBlob,
}))

vi.mock('./downloadBlob', () => ({
  downloadBlob: downloadMocks.downloadBlob,
}))

import { downloadAllImages } from './photoExport'

describe('photoExport', () => {
  afterEach(() => {
    requestMocks.requestBlob.mockClear()
    downloadMocks.downloadBlob.mockClear()
  })

  it('descarga fotos privadas mediante requestBlob y conserva el nombre de archivo', async () => {
    await downloadAllImages([
      { url: '/api/notas-attachments-file/u/foto.jpg', fileName: 'foto.jpg' },
    ])

    expect(requestMocks.requestBlob).toHaveBeenCalledWith(
      '/api/notas-attachments-file/u/foto.jpg',
    )
    expect(downloadMocks.downloadBlob).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image/jpeg' }),
      'foto.jpg',
    )
  })
})
