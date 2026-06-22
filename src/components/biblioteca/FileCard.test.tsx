import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    renderWithProviders(
      <FileCard item={item()} onToggleSelect={noop} onRename={noop} onOpen={noop} />,
    )
    expect(screen.getByText('Contrato de edición.pdf')).toBeInTheDocument()
    // 167936 B ≈ 164 KB.
    expect(screen.getByText('PDF · 164 KB')).toBeInTheDocument()
  })

  it('omite el tamaño cuando byteSize es null', () => {
    renderWithProviders(
      <FileCard
        item={item({ byteSize: null, fileType: 'image' })}
        onToggleSelect={noop}
        onRename={noop}
        onOpen={noop}
      />,
    )
    expect(screen.getByText('Imagen')).toBeInTheDocument()
  })

  it('expone acciones de renombrar/descargar/eliminar', () => {
    renderWithProviders(
      <FileCard item={item()} onToggleSelect={noop} onRename={noop} onOpen={noop} />,
    )
    expect(screen.getByRole('button', { name: 'Renombrar' })).toBeInTheDocument()
    // pdf-saved/pdf-stamp no son descargables; notas-attachment sí.
    expect(screen.getByRole('button', { name: 'Descargar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
  })

  it('en papelera solo muestra Restaurar', () => {
    renderWithProviders(
      <FileCard
        item={item()}
        trash
        onToggleSelect={noop}
        onRename={noop}
        onOpen={noop}
      />,
    )
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
        onToggleSelect={noop}
        onRename={noop}
        onOpen={noop}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Descargar' })).toBeNull()
  })

  it('abre el visor al hacer clic en la card', async () => {
    const onOpen = vi.fn()
    renderWithProviders(
      <FileCard item={item()} onToggleSelect={noop} onRename={noop} onOpen={onOpen} />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Abrir Contrato de edición.pdf' }),
    )
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ itemId: '1' }))
  })

  it('NO abre el visor cuando se clickea un botón de acción (stopPropagation)', async () => {
    const onOpen = vi.fn()
    const onRename = vi.fn()
    renderWithProviders(
      <FileCard
        item={item()}
        onToggleSelect={onRename}
        onRename={onRename}
        onOpen={onOpen}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Renombrar' }))
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('el círculo de selección togglea sin abrir el visor (stopPropagation)', async () => {
    const onOpen = vi.fn()
    const onToggleSelect = vi.fn()
    renderWithProviders(
      <FileCard
        item={item()}
        onToggleSelect={onToggleSelect}
        onRename={noop}
        onOpen={onOpen}
      />,
    )
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Seleccionar Contrato de edición.pdf' }),
    )
    expect(onToggleSelect).toHaveBeenCalledTimes(1)
    expect(onToggleSelect).toHaveBeenCalledWith(expect.objectContaining({ itemId: '1' }))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('refleja el estado seleccionado (aria-checked)', () => {
    renderWithProviders(
      <FileCard
        item={item()}
        selected
        anySelected
        onToggleSelect={noop}
        onRename={noop}
        onOpen={noop}
      />,
    )
    expect(
      screen.getByRole('checkbox', { name: 'Seleccionar Contrato de edición.pdf' }),
    ).toBeChecked()
  })

  // ---- Fijado + etiquetas (PR-C) ----

  it('muestra el indicador de fijado cuando item.pinned', () => {
    const { rerender } = renderWithProviders(
      <FileCard item={item()} onToggleSelect={noop} onRename={noop} onOpen={noop} />,
    )
    expect(screen.queryByLabelText('Fijado')).toBeNull()

    rerender(
      <FileCard
        item={item({ pinned: true })}
        onToggleSelect={noop}
        onRename={noop}
        onOpen={noop}
      />,
    )
    expect(screen.getByLabelText('Fijado')).toBeInTheDocument()
  })

  it('clickear una etiqueta llama onTagClick sin abrir el visor', async () => {
    const onOpen = vi.fn()
    const onTagClick = vi.fn()
    renderWithProviders(
      <FileCard
        item={item({ tags: ['lectura'] })}
        onToggleSelect={noop}
        onRename={noop}
        onOpen={onOpen}
        onTagClick={onTagClick}
      />,
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Filtrar por etiqueta lectura' }),
    )
    expect(onTagClick).toHaveBeenCalledWith('lectura')
    expect(onOpen).not.toHaveBeenCalled()
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
        selectedIds={new Set()}
        onToggleSelect={noop}
        onRename={noop}
        onOpen={noop}
      />,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Uno.pdf')).toBeInTheDocument()
    expect(screen.getByText('Dos.pdf')).toBeInTheDocument()
  })
})
