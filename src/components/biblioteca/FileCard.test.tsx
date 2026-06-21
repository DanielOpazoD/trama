import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FileCard } from './FileCard'
import { BibliotecaGridView } from './BibliotecaGridView'
import type { LibraryItem } from '../../types/biblioteca'

function item(partial: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'notas-attachment:1',
    kind: 'notas-attachment',
    itemId: '1',
    title: 'Contrato de edición.pdf',
    fileType: 'pdf',
    source: 'subido',
    mimeType: 'application/pdf',
    byteSize: 167_936,
    storageKey: 'demo/contrato',
    storageDomain: 'notas-attachments',
    tags: [],
    pinned: false,
    aiStatus: null,
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
    ...partial,
  }
}

describe('<FileCard />', () => {
  it('muestra el nombre y la metadata (tipo · tamaño)', () => {
    render(<FileCard item={item()} />)
    expect(screen.getByText('Contrato de edición.pdf')).toBeInTheDocument()
    // 167936 B ≈ 164 KB.
    expect(screen.getByText('PDF · 164 KB')).toBeInTheDocument()
  })

  it('omite el tamaño cuando byteSize es null', () => {
    render(<FileCard item={item({ byteSize: null, fileType: 'image' })} />)
    expect(screen.getByText('Imagen')).toBeInTheDocument()
  })
})

describe('<BibliotecaGridView />', () => {
  it('renderiza una card por item en una lista', () => {
    render(
      <BibliotecaGridView
        items={[
          item({ id: 'a', itemId: 'a', title: 'Uno.pdf' }),
          item({ id: 'b', itemId: 'b', title: 'Dos.pdf' }),
        ]}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Uno.pdf')).toBeInTheDocument()
    expect(screen.getByText('Dos.pdf')).toBeInTheDocument()
  })
})
