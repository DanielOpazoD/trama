import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { FavoritosPanel, youtubeThumb } from './FavoritosPanel'
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
    expect(screen.getByRole('heading', { name: 'Favoritos' })).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Project Gutenberg' })
    expect(link).toHaveAttribute('href', 'https://www.gutenberg.org/')
    expect(screen.getByText(/gutenberg\.org/)).toBeInTheDocument()
    expect(screen.getByDisplayValue('para ediciones viejas')).toBeInTheDocument()
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
})

describe('youtubeThumb', () => {
  it('extrae el id de las formas de URL de YouTube', () => {
    const thumb = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
    expect(youtubeThumb('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      thumb('dQw4w9WgXcQ'),
    )
    expect(youtubeThumb('https://youtu.be/dQw4w9WgXcQ')).toBe(thumb('dQw4w9WgXcQ'))
    expect(youtubeThumb('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      thumb('dQw4w9WgXcQ'),
    )
  })

  it('devuelve null para páginas que no son videos', () => {
    expect(youtubeThumb('https://www.gutenberg.org/')).toBeNull()
    expect(youtubeThumb('https://www.youtube.com/feed/subscriptions')).toBeNull()
    expect(youtubeThumb('no es una url')).toBeNull()
  })
})
