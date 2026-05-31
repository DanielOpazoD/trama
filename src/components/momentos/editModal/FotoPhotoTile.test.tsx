import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FotoPhotoTile, type PhotoEditItem } from './FotoPhotoTile'

const existingItem: PhotoEditItem = {
  kind: 'existing',
  storageKey: 'foto uno.jpg',
  width: 800,
  height: 600,
}

function renderTile(
  item: PhotoEditItem,
  overrides: Partial<Parameters<typeof FotoPhotoTile>[0]> = {},
) {
  const props = {
    item,
    idx: 0,
    total: 1,
    disabled: false,
    onRemove: vi.fn(),
    onSetPrimary: vi.fn(),
    onMove: vi.fn(),
    ...overrides,
  }
  render(<FotoPhotoTile {...props} />)
  return props
}

describe('<FotoPhotoTile />', () => {
  it('usa el endpoint de archivo para fotos existentes', () => {
    renderTile(existingItem)
    expect(screen.getByRole('img', { name: 'foto 1' })).toHaveAttribute(
      'src',
      '/api/momentos-file/foto%20uno.jpg',
    )
    expect(screen.getByText('★ portada')).toBeInTheDocument()
  })

  it('muestra badge de foto nueva y usa preview local', () => {
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    renderTile({ kind: 'new', file, previewUrl: 'blob:preview' })
    expect(screen.getByRole('img', { name: 'foto 1' })).toHaveAttribute(
      'src',
      'blob:preview',
    )
    expect(screen.getByText('nueva')).toBeInTheDocument()
  })

  it('despacha acciones de quitar, portada y mover', async () => {
    const user = userEvent.setup()
    const props = renderTile(existingItem, { idx: 1, total: 3 })

    await user.click(screen.getByRole('button', { name: 'Quitar foto 2' }))
    await user.click(screen.getByRole('button', { name: '★ portada' }))
    await user.click(screen.getByRole('button', { name: 'Mover foto 2 hacia atrás' }))
    await user.click(screen.getByRole('button', { name: 'Mover foto 2 hacia adelante' }))

    expect(props.onRemove).toHaveBeenCalledTimes(1)
    expect(props.onSetPrimary).toHaveBeenCalledTimes(1)
    expect(props.onMove).toHaveBeenNthCalledWith(1, -1)
    expect(props.onMove).toHaveBeenNthCalledWith(2, 1)
  })
})
