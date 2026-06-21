import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { FileCard } from './FileCard'
import { BibliotecaGridView } from './BibliotecaGridView'
import type { LibraryItem } from '../../types/biblioteca'

const noop = () => {}

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
    renderWithProviders(<FileCard item={item()} onRename={noop} />)
    expect(screen.getByText('Contrato de edición.pdf')).toBeInTheDocument()
    // 167936 B ≈ 164 KB.
    expect(screen.getByText('PDF · 164 KB')).toBeInTheDocument()
  })

  it('omite el tamaño cuando byteSize es null', () => {
    renderWithProviders(
      <FileCard item={item({ byteSize: null, fileType: 'image' })} onRename={noop} />,
    )
    expect(screen.getByText('Imagen')).toBeInTheDocument()
  })

  it('expone acciones de renombrar/descargar/eliminar', () => {
    renderWithProviders(<FileCard item={item()} onRename={noop} />)
    expect(screen.getByRole('button', { name: 'Renombrar' })).toBeInTheDocument()
    // pdf-saved/pdf-stamp no son descargables; notas-attachment sí.
    expect(screen.getByRole('button', { name: 'Descargar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
  })

  it('en papelera solo muestra Restaurar', () => {
    renderWithProviders(<FileCard item={item()} trash onRename={noop} />)
    expect(screen.getByRole('button', { name: 'Restaurar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Eliminar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Renombrar' })).toBeNull()
  })

  it('oculta Descargar cuando el dominio no tiene blob servible (pdf-stamp)', () => {
    renderWithProviders(
      <FileCard
        item={item({
          kind: 'pdf-stamp',
          storageDomain: 'pdf-stamp-assets',
          storageKey: null,
        })}
        onRename={noop}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Descargar' })).toBeNull()
  })
})

describe('<BibliotecaGridView />', () => {
  it('renderiza una card por item en una lista', () => {
    renderWithProviders(
      <BibliotecaGridView
        items={[
          item({ id: 'a', itemId: 'a', title: 'Uno.pdf' }),
          item({ id: 'b', itemId: 'b', title: 'Dos.pdf' }),
        ]}
        onRename={noop}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Uno.pdf')).toBeInTheDocument()
    expect(screen.getByText('Dos.pdf')).toBeInTheDocument()
  })
})
