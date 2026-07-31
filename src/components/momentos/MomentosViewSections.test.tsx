import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MomentosToolbar } from './MomentosViewSections'

/**
 * La barra de Momentos: a 375px eran CUATRO filas apiladas —chips, Línea/Álbum,
 * compartir y tamaño— y 184px de controles antes de la primera foto. Estos
 * tests fijan que los cuatro grupos comparten una sola fila y que el control de
 * tamaño sólo aparece donde significa algo.
 */
function renderToolbar(props: Partial<Parameters<typeof MomentosToolbar>[0]> = {}) {
  const onTileSizeChange = vi.fn()
  const onShare = vi.fn()
  render(
    <MomentosToolbar
      contentFilter="all"
      viewMode="album"
      itemCount={5}
      selectionMode={false}
      onChangeContentFilter={vi.fn()}
      onChangeViewMode={vi.fn()}
      onShare={onShare}
      onToggleSelectionMode={vi.fn()}
      tileSize="medium"
      onTileSizeChange={onTileSizeChange}
      showTileSize
      {...props}
    />,
  )
  return { onTileSizeChange, onShare }
}

describe('<MomentosToolbar />', () => {
  it('el menú de tamaño vive en la barra y cambia el valor', async () => {
    const user = userEvent.setup()
    const { onTileSizeChange } = renderToolbar()

    await user.click(screen.getByRole('button', { name: /tamaño: medio/i }))
    await user.click(screen.getByRole('menuitem', { name: 'grande' }))

    expect(onTileSizeChange).toHaveBeenCalledWith('large')
  })

  /**
   * En la línea de tiempo no hay miniaturas que dimensionar: el control sería
   * exactamente el tipo de botón inerte que este pack quita.
   */
  it('el tamaño no aparece fuera del álbum', () => {
    renderToolbar({ viewMode: 'timeline', showTileSize: false })

    expect(screen.queryByRole('button', { name: /tamaño/i })).toBeNull()
  })

  it('compartir es un icono con nombre accesible, no una fila propia', async () => {
    const user = userEvent.setup()
    const { onShare } = renderToolbar()

    const boton = screen.getByRole('button', { name: 'compartir momentos' })
    // Icono: sin texto visible, pero alcanzable por nombre accesible.
    expect(boton.textContent?.trim()).toBe('')
    await user.click(boton)
    expect(onShare).toHaveBeenCalledOnce()
  })

  it('«seleccionar» sólo tiene sentido en la línea de tiempo con varios ítems', () => {
    renderToolbar({ viewMode: 'album' })
    expect(screen.queryByRole('button', { name: 'seleccionar' })).toBeNull()
  })
})
