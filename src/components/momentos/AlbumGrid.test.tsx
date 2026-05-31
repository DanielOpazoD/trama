import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Entity, Momento } from '../../types'
import { AlbumGrid } from './AlbumGrid'

const entity = {
  id: 'e1',
  name: 'Valparaíso',
  type: 'lugar',
} as Entity

const photoMomento = {
  id: 'foto-1',
  kind: 'foto',
  capturedAt: '2026-05-12T10:00:00Z',
  note: null,
  entityIds: ['e1'],
  links: [],
  origin: { kind: 'manual' },
  createdAt: '2026-05-12T10:00:00Z',
  updatedAt: '2026-05-12T10:00:00Z',
  payload: {
    caption: 'Puerto al atardecer',
    items: [
      { storageKey: 'puerto uno.jpg', width: 800, height: 600 },
      { storageKey: 'puerto dos.jpg', width: 800, height: 600 },
    ],
  },
} as unknown as Momento

const noteMomento = {
  ...photoMomento,
  id: 'nota-1',
  kind: 'nota',
  payload: { bodyText: 'no soy foto' },
} as unknown as Momento

const legacyPhotoMomento = {
  ...photoMomento,
  id: 'foto-legacy',
  payload: {
    caption: 'Foto migrada',
    photos: [
      { storageKey: 'legada uno.jpg', width: 800, height: 600 },
      { storageKey: 'legada dos.jpg', width: 800, height: 600 },
    ],
    primaryStorageKey: 'legada uno.jpg',
  },
} as unknown as Momento

describe('<AlbumGrid />', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('muestra estado vacío cuando no recibe fotos', () => {
    render(
      <AlbumGrid
        items={[noteMomento]}
        entitiesById={new Map([['e1', entity]])}
        onDelete={() => {}}
      />,
    )

    expect(screen.getByText('No hay fotos todavía')).toBeInTheDocument()
  })

  it('renderiza fotos, ignora otros kinds y permite eliminar', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()

    render(
      <AlbumGrid
        items={[noteMomento, photoMomento]}
        entitiesById={new Map([['e1', entity]])}
        onDelete={onDelete}
      />,
    )

    const image = screen.getByRole('img', { name: 'Puerto al atardecer' })
    expect(image).toHaveAttribute('src', '/api/momentos-file/puerto%20uno.jpg')
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.queryByText('no soy foto')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /eliminar foto/i }))

    expect(onDelete).toHaveBeenCalledWith('foto-1')
  })

  it('renderiza fotos persistidas con payload photos legado', () => {
    render(
      <AlbumGrid
        items={[legacyPhotoMomento]}
        entitiesById={new Map([['e1', entity]])}
        onDelete={() => {}}
      />,
    )

    expect(screen.getByRole('img', { name: 'Foto migrada' })).toHaveAttribute(
      'src',
      '/api/momentos-file/legada%20uno.jpg',
    )
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  it('persiste tamaño y modo cronológico', async () => {
    const user = userEvent.setup()

    render(
      <AlbumGrid
        items={[photoMomento]}
        entitiesById={new Map([['e1', entity]])}
        onDelete={() => {}}
      />,
    )

    await user.click(screen.getByRole('tab', { name: 'cronológico' }))
    await user.click(screen.getByRole('tab', { name: 'grande' }))

    expect(window.localStorage.getItem('trama:album-mode')).toBe('yearly')
    expect(window.localStorage.getItem('trama:album-size')).toBe('large')
    expect(screen.getByText('2026')).toBeInTheDocument()
    expect(screen.getByText('Valparaíso')).toBeInTheDocument()
  })
})
