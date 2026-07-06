import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MomentosFilters } from './MomentosFilters'

describe('<MomentosFilters />', () => {
  it('cambia filtros y resetea a línea al elegir notas o recortes', async () => {
    const user = userEvent.setup()
    const onChangeContentFilter = vi.fn()
    const onChangeViewMode = vi.fn()

    render(
      <MomentosFilters
        contentFilter="all"
        onChangeContentFilter={onChangeContentFilter}
        viewMode="album"
        onChangeViewMode={onChangeViewMode}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Notas' }))
    await user.click(screen.getByRole('button', { name: 'Recortes' }))
    await user.click(screen.getByRole('button', { name: 'Fotos' }))

    expect(onChangeContentFilter).toHaveBeenNthCalledWith(1, 'nota')
    expect(onChangeViewMode).toHaveBeenNthCalledWith(1, 'timeline')
    expect(onChangeContentFilter).toHaveBeenNthCalledWith(2, 'recorte')
    expect(onChangeViewMode).toHaveBeenNthCalledWith(2, 'timeline')
    expect(onChangeContentFilter).toHaveBeenNthCalledWith(3, 'foto')
  })

  it('el chip Videos filtra por clip y salta al álbum', async () => {
    const user = userEvent.setup()
    const onChangeContentFilter = vi.fn()
    const onChangeViewMode = vi.fn()

    render(
      <MomentosFilters
        contentFilter="all"
        onChangeContentFilter={onChangeContentFilter}
        viewMode="timeline"
        onChangeViewMode={onChangeViewMode}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Videos' }))

    expect(onChangeContentFilter).toHaveBeenCalledWith('video')
    expect(onChangeViewMode).toHaveBeenCalledWith('album')
  })

  it('muestra los chips de contenido y el segmentado de vista', () => {
    render(
      <MomentosFilters
        contentFilter="all"
        onChangeContentFilter={() => {}}
        viewMode="album"
        onChangeViewMode={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Todos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Videos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Línea' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Álbum' })).toBeEnabled()
  })

  it('mantiene Álbum visible pero deshabilitado si el filtro no permite fotos', () => {
    render(
      <MomentosFilters
        contentFilter="recorte"
        onChangeContentFilter={() => {}}
        viewMode="timeline"
        onChangeViewMode={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Álbum' })).toBeDisabled()
  })
})
