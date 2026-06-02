import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { AttachmentsPanel } from './AttachmentsPanel'

const rows = [
  {
    id: 'a1',
    owner_type: 'prompt',
    owner_id: 'p1',
    file_name: 'tiny.txt',
    mime_type: 'text/plain',
    byte_size: 900,
    storage_key: 'user/tiny.txt',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'a2',
    owner_type: 'prompt',
    owner_id: 'p1',
    file_name: 'brief.pdf',
    mime_type: 'application/pdf',
    byte_size: 24 * 1024,
    storage_key: 'user/brief.pdf',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  },
  {
    id: 'a3',
    owner_type: 'prompt',
    owner_id: 'p1',
    file_name: 'deck.zip',
    mime_type: 'application/zip',
    byte_size: 2.5 * 1024 * 1024,
    storage_key: 'user/deck.zip',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
  },
]

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/notas-attachments?')) {
        return new Response(JSON.stringify(rows), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === '/api/notas-attachments-upload' && init?.method === 'POST') {
        return new Response(JSON.stringify(rows[0]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url === '/api/notas-attachments/a1' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      if (url === '/api/notas-attachments-file/user/tiny.txt') {
        return new Response(new Blob(['archivo'], { type: 'text/plain' }), {
          status: 200,
        })
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:attachment'),
    revokeObjectURL: vi.fn(),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<AttachmentsPanel />', () => {
  it('lista anexos con tamaño legible y permite quitar uno', async () => {
    renderWithProviders(<AttachmentsPanel ownerType="prompt" ownerId="p1" />)

    expect(await screen.findByText('tiny.txt')).toBeInTheDocument()
    expect(screen.getByText('900 B')).toBeInTheDocument()
    expect(screen.getByText('24 KB')).toBeInTheDocument()
    expect(screen.getByText('2.5 MB')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar anexo' })[0]!)

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/notas-attachments/a1',
        expect.objectContaining({ method: 'DELETE' }),
      )
    })
  })

  it('sube un archivo desde el input del panel', async () => {
    renderWithProviders(<AttachmentsPanel ownerType="prompt" ownerId="p1" />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['nuevo'], 'nuevo.md', { type: 'text/markdown' })
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/notas-attachments-upload',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    expect(input.value).toBe('')
  })

  it('descarga un anexo y libera la URL temporal', async () => {
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})

    renderWithProviders(<AttachmentsPanel ownerType="prompt" ownerId="p1" />)

    fireEvent.click(await screen.findByText('tiny.txt'))

    await waitFor(() => {
      expect(URL.createObjectURL).toHaveBeenCalled()
      expect(clickSpy).toHaveBeenCalled()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:attachment')
    })

    clickSpy.mockRestore()
  })
})
