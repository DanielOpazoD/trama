import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NotasFeedContent } from './NotasFeedContent'

describe('<NotasFeedContent />', () => {
  it('muestra el estado vacío inicial y permite enfocar el composer', async () => {
    const user = userEvent.setup()
    const onFocusComposer = vi.fn()

    render(
      <NotasFeedContent
        segment="todo"
        uploadingImages={0}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        everythingEmpty
        itemCount={0}
        hasContentFilter={false}
        galleryMode={false}
        isFetchingNextPage={false}
        onFocusComposer={onFocusComposer}
        onClearFilters={vi.fn()}
        favoritosPanel={<div>favoritos</div>}
        gallery={<div>galería</div>}
        list={<div>lista</div>}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Escribir primera nota' }))
    expect(onFocusComposer).toHaveBeenCalledTimes(1)
  })

  it('muestra el estado filtrado vacío y permite limpiar filtros', async () => {
    const user = userEvent.setup()
    const onClearFilters = vi.fn()

    render(
      <NotasFeedContent
        segment="todo"
        uploadingImages={0}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        everythingEmpty={false}
        itemCount={0}
        hasContentFilter
        galleryMode={false}
        isFetchingNextPage={false}
        onFocusComposer={vi.fn()}
        onClearFilters={onClearFilters}
        favoritosPanel={<div>favoritos</div>}
        gallery={<div>galería</div>}
        list={<div>lista</div>}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Ver todo' }))
    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('un fallo de carga ofrece reintentar en vez de pintarse como un vacío', () => {
    // Antes era un EmptyMessage sin salida: se veía igual que «no hay nada».
    const onRetry = vi.fn()
    render(
      <NotasFeedContent
        segment="todo"
        uploadingImages={0}
        isLoading={false}
        isError
        onRetry={onRetry}
        everythingEmpty
        itemCount={0}
        hasContentFilter={false}
        galleryMode={false}
        isFetchingNextPage={false}
        onFocusComposer={vi.fn()}
        onClearFilters={vi.fn()}
        favoritosPanel={<div>favoritos</div>}
        gallery={<div>galería</div>}
        list={<div>lista</div>}
      />,
    )
    const boton = screen.getByRole('button', { name: /reintentar/i })
    boton.click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
