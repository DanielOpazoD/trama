import { fireEvent, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test-utils'

// La compresión real necesita createImageBitmap/canvas (no existen en el entorno
// de test): la neutralizamos para que devuelva el archivo tal cual.
vi.mock('../../lib/imageCompression', () => ({
  compressImage: (file: File) => Promise.resolve(file),
}))

// La exportación (descarga/PDF) toca apiFetch/canvas/jsPDF/Blob: la mockeamos
// para verificar el cableado de los botones sin ejecutar browser-APIs.
const exportMocks = vi.hoisted(() => ({
  downloadAllImages: vi.fn(() => Promise.resolve()),
  exportImagesToPdf: vi.fn(() => Promise.resolve()),
}))
vi.mock('../../lib/photoExport', () => ({
  downloadAllImages: exportMocks.downloadAllImages,
  exportImagesToPdf: exportMocks.exportImagesToPdf,
}))

// El editor de imágenes es perezoso/browser-only: lo mockeamos para verificar el
// cableado (adjuntar-y-editar, re-editar) sin montar canvas.
const editorMock = vi.hoisted(() => ({ editImage: vi.fn() }))
vi.mock('../../lib/imageEditor', () => ({ editImage: editorMock.editImage }))

import { AttachmentPhotos } from './AttachmentPhotos'

/** POSTs al endpoint de upload observados durante el test. */
let uploadCalls: string[] = []

function stubFetch() {
  uploadCalls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/api/notas-attachments-upload') && init?.method === 'POST') {
        uploadCalls.push(u)
        const n = uploadCalls.length
        return new Response(
          JSON.stringify({
            id: `att-${n}`,
            owner_type: 'week',
            owner_id: '2026-06-01',
            file_name: `f${n}.jpg`,
            mime_type: 'image/jpeg',
            byte_size: 10,
            storage_key: `u1/${n}.jpg`,
            created_at: 'x',
            updated_at: 'x',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        )
      }
      // GET de la lista → vacío (evita montar miniaturas autenticadas).
      return new Response('[]', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
}

describe('<AttachmentPhotos />', () => {
  beforeEach(() => {
    localStorage.removeItem('trama-demo')
    exportMocks.downloadAllImages.mockClear()
    exportMocks.exportImagesToPdf.mockClear()
    // Por defecto el editor devuelve el archivo tal cual (= "no se editó").
    editorMock.editImage.mockReset()
    editorMock.editImage.mockImplementation(async (f: File) => f)
    stubFetch()
  })
  afterEach(() => vi.unstubAllGlobals())

  function fileInput(container: HTMLElement) {
    const input = container.querySelector('input[type="file"]')
    if (!(input instanceof HTMLInputElement)) throw new Error('no file input')
    return input
  }

  it('el input permite seleccionar varias imágenes', () => {
    const { container } = renderWithProviders(
      <AttachmentPhotos ownerType="week" ownerId="2026-06-01" />,
    )
    const input = fileInput(container)
    expect(input).toHaveAttribute('multiple')
    expect(input).toHaveAttribute('accept', 'image/*')
  })

  it('sube cada imagen seleccionada (1 o más)', async () => {
    const { container } = renderWithProviders(
      <AttachmentPhotos ownerType="week" ownerId="2026-06-01" />,
    )
    const input = fileInput(container)
    const f1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
    const f2 = new File(['b'], 'b.png', { type: 'image/png' })

    fireEvent.change(input, { target: { files: [f1, f2] } })

    await waitFor(() => expect(uploadCalls).toHaveLength(2))
  })

  it('omite archivos que no son imágenes y sube solo las imágenes', async () => {
    const { container } = renderWithProviders(
      <AttachmentPhotos ownerType="task" ownerId="t-1" />,
    )
    const input = fileInput(container)
    const img = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
    const txt = new File(['t'], 't.txt', { type: 'text/plain' })

    fireEvent.change(input, { target: { files: [img, txt] } })

    await waitFor(() => expect(uploadCalls).toHaveLength(1))
  })

  it('los botones descargar / PDF aparecen con fotos y disparan la exportación', async () => {
    // La lista trae una foto → se montan los botones de exportar.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const u = String(url)
        if (u.includes('/api/notas-attachments?')) {
          return new Response(
            JSON.stringify([
              {
                id: 'a1',
                owner_type: 'task',
                owner_id: 't-1',
                file_name: 'f.jpg',
                mime_type: 'image/jpeg',
                byte_size: 10,
                storage_key: 'u1/f.jpg',
                created_at: 'x',
                updated_at: 'x',
              },
            ]),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response('', { status: 200 })
      }),
    )

    const { findByLabelText } = renderWithProviders(
      <AttachmentPhotos ownerType="task" ownerId="t-1" title="Mi tarea" />,
    )
    const dl = await findByLabelText('Descargar todas las fotos')
    const pdf = await findByLabelText('Exportar fotos a PDF')

    fireEvent.click(dl)
    await waitFor(() => expect(exportMocks.downloadAllImages).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(pdf).not.toBeDisabled())

    fireEvent.click(pdf)
    await waitFor(() => expect(exportMocks.exportImagesToPdf).toHaveBeenCalledTimes(1))
    expect(exportMocks.exportImagesToPdf).toHaveBeenCalledWith(
      expect.any(Array),
      'Mi tarea',
    )
  })

  it('"adjuntar y editar" pasa cada imagen por el editor antes de subir', async () => {
    const edited = new File(['e'], 'e.webp', { type: 'image/webp' })
    editorMock.editImage.mockResolvedValue(edited)

    const { container, getByLabelText } = renderWithProviders(
      <AttachmentPhotos ownerType="week" ownerId="2026-06-01" />,
    )
    // Marca la próxima selección como "editar", luego dispara el input.
    fireEvent.click(getByLabelText('Adjuntar y editar fotos'))
    const input = fileInput(container)
    const f1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [f1] } })

    await waitFor(() =>
      expect(editorMock.editImage).toHaveBeenCalledWith(
        f1,
        expect.objectContaining({ outputType: 'image/webp' }),
      ),
    )
    await waitFor(() => expect(uploadCalls).toHaveLength(1))
  })

  it('editar una foto ya guardada: baja el blob, edita, sube la nueva y borra la vieja', async () => {
    const edited = new File(['e'], 'e.webp', { type: 'image/webp' })
    editorMock.editImage.mockResolvedValue(edited)

    const row = {
      id: 'a1',
      owner_type: 'task',
      owner_id: 't-1',
      file_name: 'f.jpg',
      mime_type: 'image/jpeg',
      byte_size: 10,
      storage_key: 'u1/f.jpg',
      created_at: 'x',
      updated_at: 'x',
    }
    const calls: { method: string; url: string }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const u = String(url)
        const method = init?.method ?? 'GET'
        calls.push({ method, url: u })
        if (method === 'DELETE') return new Response('', { status: 200 })
        if (method === 'POST' && u.includes('/api/notas-attachments-upload')) {
          return new Response(
            JSON.stringify({ ...row, id: 'a2', storage_key: 'u1/2.webp' }),
            {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
        if (u.includes('/api/notas-attachments?')) {
          return new Response(JSON.stringify([row]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        // GET del blob de la foto (photo.url) y cualquier otro.
        return new Response(new Blob(['img']), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      }),
    )

    const { findByLabelText } = renderWithProviders(
      <AttachmentPhotos ownerType="task" ownerId="t-1" />,
    )
    const editBtn = await findByLabelText(/editar foto f\.jpg/i)
    fireEvent.click(editBtn)

    await waitFor(() => expect(editorMock.editImage).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.method === 'POST' && c.url.includes('notas-attachments-upload'),
        ),
      ).toBe(true),
    )
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true))
  })
})
