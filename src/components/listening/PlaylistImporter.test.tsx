import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlaylistImporter } from './PlaylistImporter'

describe('<PlaylistImporter />', () => {
  it('abre el formulario, propaga cambios y submit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault())

    render(
      <PlaylistImporter
        value="https://open.spotify.com/playlist/abc"
        onChange={onChange}
        onSubmit={onSubmit}
        isPending={false}
        error={null}
      />,
    )

    await user.click(screen.getByRole('button', { name: /importar playlist/i }))
    await user.type(screen.getByRole('textbox'), 'x')
    await user.click(screen.getByRole('button', { name: /^importar$/i }))

    expect(onChange).toHaveBeenCalled()
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('se abre automáticamente para mostrar errores', () => {
    render(
      <PlaylistImporter
        value=""
        onChange={() => {}}
        onSubmit={() => {}}
        isPending={false}
        error={new Error('playlist privada')}
      />,
    )

    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByText('playlist privada')).toBeInTheDocument()
  })
})
