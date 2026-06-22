/**
 * PR-A — BibliotecaViewer: enrutado por tipo (imagen / Office sin preview),
 * cierre por Escape, y la tira de metadata (extensión + Creado + Modificado).
 *
 * Los visores de PDF y de texto son chunks lazy que bajan blobs; acá probamos
 * el enrutado y el cascarón (la imagen, la tarjeta sin-preview y la metadata).
 * El blob autenticado de la imagen se mockea como en AuthenticatedMedia.test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const requestMocks = vi.hoisted(() => ({
  requestBlob: vi.fn(async () => new Blob(['media'], { type: 'image/svg+xml' })),
}))

vi.mock('../../api/request', async (importActual) => ({
  ...(await importActual<typeof import('../../api/request')>()),
  requestBlob: requestMocks.requestBlob,
}))

import { renderWithProviders } from '../../test-utils'
import { BibliotecaViewer } from './BibliotecaViewer'
import type { LibraryItem } from '../../types/biblioteca'

function item(partial: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'notas-attachment:a1',
    kind: 'notas-attachment',
    itemId: 'a1',
    title: 'Contrato de edición.pdf',
    fileType: 'pdf',
    source: 'subido',
    mimeType: 'application/pdf',
    byteSize: 167_936,
    storageKey: 'demo/a1.pdf',
    storageDomain: 'notas-attachments',
    tags: [],
    pinned: false,
    aiStatus: null,
    createdAt: '2026-06-18T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
    ...partial,
  }
}

beforeEach(() => {
  requestMocks.requestBlob.mockClear()
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:viewer'),
      revokeObjectURL: vi.fn(),
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('<BibliotecaViewer />', () => {
  it('muestra el título y la tira de metadata (extensión + Creado + Modificado)', () => {
    renderWithProviders(<BibliotecaViewer item={item()} onClose={() => {}} />)
    expect(
      screen.getByRole('heading', { name: 'Contrato de edición.pdf' }),
    ).toBeInTheDocument()
    // Etiquetas de la tira de metadata (únicas). El valor "PDF" aparece dos
    // veces (Extensión y Tipo), así que lo verificamos con getAllByText.
    expect(screen.getByText('Extensión')).toBeInTheDocument()
    expect(screen.getByText('Tipo')).toBeInTheDocument()
    expect(screen.getByText('Creado')).toBeInTheDocument()
    expect(screen.getByText('Modificado')).toBeInTheDocument()
    expect(screen.getByText('Fuente')).toBeInTheDocument()
    expect(screen.getAllByText('PDF').length).toBeGreaterThanOrEqual(1)
  })

  it('imagen → renderiza la imagen (object-URL autenticado)', async () => {
    renderWithProviders(
      <BibliotecaViewer
        item={item({
          title: 'foto.png',
          fileType: 'image',
          mimeType: 'image/png',
          storageDomain: 'recortes-media',
          storageKey: 'demo/foto-1.svg',
        })}
        onClose={() => {}}
      />,
    )
    await waitFor(() => {
      const img = screen.getByAltText('foto.png') as HTMLImageElement
      expect(img.getAttribute('src')).toBe('blob:viewer')
    })
  })

  it('Office (.xlsx) → tarjeta sin previsualización con CTA Descargar', () => {
    renderWithProviders(
      <BibliotecaViewer
        item={item({
          title: 'Presupuesto.xlsx',
          fileType: 'spreadsheet',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          storageKey: 'demo/sheet.xlsx',
        })}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/no se puede previsualizar/i)).toBeInTheDocument()
    // Hay un CTA Descargar (la tarjeta lo muestra prominente; el header además
    // tiene el ícono de descarga, así que puede haber más de uno).
    expect(
      screen.getAllByRole('button', { name: 'Descargar' }).length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('no descargable (pdf-stamp data-url) → explica que no hay preview ni descarga', () => {
    renderWithProviders(
      <BibliotecaViewer
        item={item({
          title: 'Firma escaneada',
          kind: 'pdf-stamp',
          fileType: 'other',
          mimeType: 'image/svg+xml',
          storageDomain: 'pdf-stamp-assets',
          storageKey: null,
        })}
        onClose={() => {}}
      />,
    )
    expect(
      screen.getByText(/no tiene una previsualización ni una descarga/i),
    ).toBeInTheDocument()
    // Sin URL servible no hay botón Descargar (ni en header ni en la tarjeta).
    expect(screen.queryByRole('button', { name: 'Descargar' })).toBeNull()
  })

  it('Escape cierra el visor', async () => {
    const onClose = vi.fn()
    renderWithProviders(<BibliotecaViewer item={item()} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // ---- Fijar + inspector "Detalles" (PR-C) ----

  it('el botón de fijar refleja el estado (Fijar / Soltar)', () => {
    const { rerender } = renderWithProviders(
      <BibliotecaViewer item={item()} onClose={() => {}} />,
    )
    // Sin fijar → ofrece "Fijar".
    expect(screen.getByRole('button', { name: 'Fijar' })).toBeInTheDocument()

    rerender(<BibliotecaViewer item={item({ pinned: true })} onClose={() => {}} />)
    // Fijado → ofrece "Soltar" y queda presionado.
    const soltar = screen.getByRole('button', { name: 'Soltar' })
    expect(soltar).toBeInTheDocument()
    expect(soltar).toHaveAttribute('aria-pressed', 'true')
  })

  it('clickear "Fijar" dispara el PATCH con { pinned: true }', async () => {
    // El visor es controlado (lee item.pinned de props), así que el toggle "en
    // sesión" lo prueba BibliotecaView; acá cubrimos que el CLICK realmente
    // dispara la mutación (el hueco que un test de solo-props no cubre).
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderWithProviders(<BibliotecaViewer item={item()} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Fijar' }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/biblioteca-item/'),
      )
      expect(call).toBeTruthy()
      expect(call?.[1]?.method).toBe('PATCH')
      expect(String(call?.[1]?.body)).toContain('"pinned":true')
    })
  })

  it('el toggle "Detalles" abre el inspector con Etiquetas y Aparece en', async () => {
    // El inspector lista conexiones (fetch real): stub vacío para acallarlo.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ links: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )

    renderWithProviders(
      <BibliotecaViewer item={item({ tags: ['lectura'] })} onClose={() => {}} />,
    )

    const detalles = screen.getByRole('button', { name: 'Detalles' })
    expect(detalles).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(detalles)
    expect(detalles).toHaveAttribute('aria-pressed', 'true')

    // Secciones del inspector + el chip de etiqueta existente. Buscamos DENTRO
    // del panel (la tira de metadata del header también tiene un "Etiquetas"
    // sr-only, así que acotamos al complementary "Detalles del archivo").
    const panel = within(
      screen.getByRole('complementary', { name: 'Detalles del archivo' }),
    )
    expect(panel.getByText('Etiquetas')).toBeInTheDocument()
    expect(panel.getByText('Aparece en')).toBeInTheDocument()
    expect(
      panel.getByRole('button', { name: 'Quitar etiqueta lectura' }),
    ).toBeInTheDocument()
  })
})
