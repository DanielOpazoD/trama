import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MomentosFilters } from './MomentosFilters'

describe('<MomentosFilters />', () => {
  it('cambia filtros y resetea a línea al elegir notas o recortes', async () => {
    const user = userEvent.setup()
    const onChangeFilterKind = vi.fn()
    const onChangeViewMode = vi.fn()

    render(
      <MomentosFilters
        filterKind={null}
        onChangeFilterKind={onChangeFilterKind}
        viewMode="album"
        onChangeViewMode={onChangeViewMode}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Notas' }))
    await user.click(screen.getByRole('button', { name: 'Recortes' }))
    await user.click(screen.getByRole('button', { name: 'Fotos' }))

    expect(onChangeFilterKind).toHaveBeenNthCalledWith(1, 'nota')
    expect(onChangeViewMode).toHaveBeenNthCalledWith(1, 'timeline')
    expect(onChangeFilterKind).toHaveBeenNthCalledWith(2, 'recorte')
    expect(onChangeViewMode).toHaveBeenNthCalledWith(2, 'timeline')
    expect(onChangeFilterKind).toHaveBeenNthCalledWith(3, 'foto')
  })

  it('oculta el toggle de álbum cuando el filtro no es foto ni todos', () => {
    render(
      <MomentosFilters
        filterKind="recorte"
        onChangeFilterKind={() => {}}
        viewMode="timeline"
        onChangeViewMode={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Álbum' })).not.toBeInTheDocument()
  })

  it('permite delegar el cambio de modo a una superficie superior', () => {
    render(
      <MomentosFilters
        filterKind={null}
        onChangeFilterKind={() => {}}
        viewMode="timeline"
        onChangeViewMode={() => {}}
        showViewToggle={false}
      />,
    )

    expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Álbum' })).not.toBeInTheDocument()
  })
})
