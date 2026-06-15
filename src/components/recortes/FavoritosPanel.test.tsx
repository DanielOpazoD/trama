import { describe, it, expect } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FavoritosPanel } from './FavoritosPanel'
import { favoritoFromRow, type FavoritoRow } from '../../api/favoritos'
import { makeQueryClient, renderWithProviders } from '../../test-utils'
import { queryKeys } from '../../state/queryClient'
import type { Favorito } from '../../api'

const ROW: FavoritoRow = {
  id: 'f1',
  url: 'https://www.gutenberg.org/',
  title: 'Project Gutenberg',
  note: 'para ediciones viejas',
  created_at: '2026-06-12T12:00:00.000Z',
  updated_at: '2026-06-12T12:00:00.000Z',
}

function setup(favoritos: Favorito[]) {
  const qc = makeQueryClient()
  qc.setQueryData(queryKeys.favoritos, favoritos)
  return renderWithProviders(<FavoritosPanel />, { queryClient: qc })
}

describe('favoritoFromRow', () => {
  it('transforma snake_case → camelCase', () => {
    expect(favoritoFromRow(ROW)).toEqual({
      id: 'f1',
      url: 'https://www.gutenberg.org/',
      title: 'Project Gutenberg',
      note: 'para ediciones viejas',
      createdAt: '2026-06-12T12:00:00.000Z',
      updatedAt: '2026-06-12T12:00:00.000Z',
    })
  })
})

describe('<FavoritosPanel />', () => {
  it('muestra la tarjeta de favorito con título, dominio y nota', () => {
    setup([favoritoFromRow(ROW)])
    const link = screen.getByRole('link', { name: 'Project Gutenberg' })
    expect(link).toHaveAttribute('href', 'https://www.gutenberg.org/')
    expect(screen.getByText(/gutenberg\.org/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('para ediciones viejas')).toBeInTheDocument()
  })

  it('sin miniatura, muestra el origen como eyebrow discreto (sin marco)', () => {
    setup([favoritoFromRow(ROW)])

    expect(screen.queryByTestId('link-media-image')).not.toBeInTheDocument()
    expect(screen.getByText(/gutenberg\.org/)).toBeInTheDocument()
  })

  it('no renderiza el ViewHeader dorado (vive embebido en Notas)', () => {
    setup([favoritoFromRow(ROW)])
    expect(screen.queryByRole('heading', { name: 'Favoritos' })).not.toBeInTheDocument()
  })

  it('mantiene la opción de nota vacía como icono, sin texto visible', async () => {
    const user = userEvent.setup()
    setup([favoritoFromRow({ ...ROW, note: null })])

    expect(screen.queryByText(/añade una nota/i)).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/nota/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /añadir nota/i }))

    expect(screen.getByLabelText('Nota del favorito')).toBeInTheDocument()
  })

  it('estado vacío invita a marcar desde la extensión', () => {
    setup([])
    expect(screen.getByText(/Todavía no marcaste/)).toBeInTheDocument()
    expect(screen.getByText(/Guardar como/)).toBeInTheDocument()
  })

  it('muestra la miniatura de YouTube cuando el favorito es un video', () => {
    setup([
      favoritoFromRow({
        ...ROW,
        id: 'yt',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'The Cure - Primavera Sound',
      }),
    ])
    const img = document.querySelector('img[src*="ytimg.com"]')
    expect(img).toHaveAttribute('src', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  })

  it('cae al eyebrow discreto si falla la miniatura del favorito', () => {
    setup([
      favoritoFromRow({
        ...ROW,
        id: 'yt',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'The Cure - Primavera Sound',
      }),
    ])
    const img = document.querySelector('img[src*="ytimg.com"]')
    expect(img).toBeInTheDocument()

    fireEvent.error(img!)

    expect(screen.queryByTestId('link-media-image')).not.toBeInTheDocument()
    expect(screen.getByText(/youtube\.com/)).toBeInTheDocument()
  })
})
