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

const assembleMocks = vi.hoisted(() => ({
  imagesToSheetPdfFile: vi.fn(
    async () => new File(['%PDF'], 'hojas.pdf', { type: 'application/pdf' }),
  ),
}))

// El ensamblador real necesita pdf-lib y canvas: acá se fija el CONTRATO —qué
// archivos recibe y con qué maquetación—, que es lo que cambió al dejar jsPDF.
vi.mock('./pdfStudio/assemble/imagesToSheetPdfFile', () => ({
  imagesToSheetPdfFile: assembleMocks.imagesToSheetPdfFile,
}))

import { downloadAllImages, exportImagesToPdf } from './photoExport'

describe('photoExport', () => {
  afterEach(() => {
    requestMocks.requestBlob.mockClear()
    downloadMocks.downloadBlob.mockClear()
    assembleMocks.imagesToSheetPdfFile.mockClear()
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

  it('arma el PDF con el ensamblador compartido, dos fotos por hoja', async () => {
    // Antes esto tenía su propia maquetación con jsPDF. El contrato que
    // importa: las fotos llegan como File y la hoja lleva dos.
    await exportImagesToPdf(
      [
        { url: '/api/f/1.jpg', fileName: 'uno.jpg' },
        { url: '/api/f/2.jpg', fileName: 'dos.jpg' },
      ],
      'Semana 3',
    )

    const llamada = assembleMocks.imagesToSheetPdfFile.mock.calls[0]
    expect(llamada).toBeDefined()
    const [files, opciones] = llamada as unknown as [File[], unknown]
    expect(files.map((file) => file.name)).toEqual(['uno.jpg', 'dos.jpg'])
    expect(opciones).toEqual({ imagesPerPage: 2 })
  })

  it('descarga el PDF con el título saneado', async () => {
    await exportImagesToPdf([{ url: '/api/f/1.jpg', fileName: 'uno.jpg' }], 'Semana 3/4')

    const [, nombre] = (downloadMocks.downloadBlob.mock.calls[0] ?? []) as [
      unknown,
      string,
    ]
    expect(nombre).toBe('Semana-3-4.pdf')
  })

  it('no arma nada si no hay fotos', async () => {
    await exportImagesToPdf([], 'vacío')

    expect(assembleMocks.imagesToSheetPdfFile).not.toHaveBeenCalled()
    expect(downloadMocks.downloadBlob).not.toHaveBeenCalled()
  })

  it('cae a un nombre por defecto cuando el título no deja caracteres útiles', async () => {
    await exportImagesToPdf([{ url: '/api/f/1.jpg', fileName: 'uno.jpg' }], '///')

    const [, nombre] = (downloadMocks.downloadBlob.mock.calls[0] ?? []) as [
      unknown,
      string,
    ]
    expect(nombre).toBe('fotos.pdf')
  })

  it('baja las fotos EN SERIE, sin ráfaga de peticiones', async () => {
    // Cada foto es una descarga autenticada. Con `Promise.all` salían todas a
    // la vez —ráfaga al backend y todos los blobs en memoria antes de
    // ensamblar—, que es lo que hacía la versión anterior a este test.
    let enVuelo = 0
    let maxEnVuelo = 0
    requestMocks.requestBlob.mockImplementation(async () => {
      enVuelo += 1
      maxEnVuelo = Math.max(maxEnVuelo, enVuelo)
      await new Promise((r) => setTimeout(r, 0))
      enVuelo -= 1
      return new Blob(['img'], { type: 'image/jpeg' })
    })

    await exportImagesToPdf(
      Array.from({ length: 5 }, (_, i) => ({
        url: `/api/f/${i}.jpg`,
        fileName: `${i}.jpg`,
      })),
      'Semana',
    )

    expect(maxEnVuelo).toBe(1)
    expect(requestMocks.requestBlob).toHaveBeenCalledTimes(5)
  })
})
