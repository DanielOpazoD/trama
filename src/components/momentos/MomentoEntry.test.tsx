import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Entity, Momento } from '../../types'
import { MomentoEntry } from './MomentoEntry'

vi.mock('./MomentoEditModal', () => ({
  MomentoEditModal: ({
    momento,
    open,
    onClose,
  }: {
    momento: Momento
    open: boolean
    onClose: () => void
  }) =>
    open ? (
      <div role="dialog" aria-label={`Editar ${momento.kind}`}>
        <button type="button" onClick={onClose}>
          cerrar
        </button>
      </div>
    ) : null,
}))

const entity: Entity = {
  id: 'e1',
  name: 'Borges',
  type: 'escritor',
  origin: { kind: 'manual' },
  createdAt: '2026-05-20T10:00:00.000Z',
  updatedAt: '2026-05-20T10:00:00.000Z',
}

function baseMomento(kind: Momento['kind'], payload: Momento['payload']): Momento {
  return {
    id: `m-${kind}`,
    kind,
    capturedAt: '2026-05-31T14:35:00.000Z',
    payload,
    note: undefined,
    origin: { kind: 'manual' },
    entityIds: ['e1', 'missing'],
    createdAt: '2026-05-31T14:35:00.000Z',
    updatedAt: '2026-05-31T14:35:00.000Z',
  }
}

describe('<MomentoEntry />', () => {
  it('renderiza una nota con entidades vinculadas y acciones contextuales', () => {
    const onDelete = vi.fn()
    render(
      <MomentoEntry
        momento={{
          ...baseMomento('nota', { bodyText: 'Una nota con filo.' }),
          origin: { kind: 'ai', provider: 'openai', model: 'gpt' },
        }}
        entitiesById={new Map([['e1', entity]])}
        onDelete={onDelete}
      />,
    )

    expect(screen.getByText('Una nota con filo.')).toBeInTheDocument()
    expect(screen.getByText('Borges')).toBeInTheDocument()
    expect(screen.getByTitle(/origen ia/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /editar momento/i }))
    expect(screen.getByRole('dialog', { name: /editar nota/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^cerrar$/i }))
    expect(screen.queryByRole('dialog', { name: /editar nota/i })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /eliminar momento/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('renderiza un recorte con autor, fuente, enlace, cita y nota', () => {
    render(
      <MomentoEntry
        momento={{
          ...baseMomento('recorte', {
            url: 'https://example.com/articulo',
            title: 'Un artículo',
            source: 'Revista',
            author: 'Autora',
            bodyText: 'Fragmento seleccionado',
          }),
          note: 'nota al margen',
        }}
        entitiesById={new Map()}
        onDelete={vi.fn()}
      />,
    )

    const link = screen.getByRole('link', { name: /un artículo/i })
    expect(link).toHaveAttribute('href', 'https://example.com/articulo')
    expect(screen.getByText('Autora')).toBeInTheDocument()
    expect(screen.getByText('Revista')).toBeInTheDocument()
    expect(screen.getByText('Fragmento seleccionado')).toBeInTheDocument()
    expect(screen.getByText('nota al margen')).toBeInTheDocument()
  })

  it('renderiza foto legacy o múltiple con portada, contador, caption y nota', () => {
    render(
      <MomentoEntry
        momento={{
          ...baseMomento('foto', {
            caption: 'la mesa de trabajo',
            items: [
              { storageKey: 'foto uno.jpg', width: 800, height: 600 },
              { storageKey: 'foto-dos.jpg', width: 640, height: 480 },
            ],
          }),
          note: 'dos fotos del mismo episodio',
        }}
        entitiesById={new Map()}
        onDelete={vi.fn()}
      />,
    )

    const openButton = screen.getByRole('button', { name: /abrir visor.*2 fotos/i })
    const image = screen.getByRole('img', { name: /la mesa de trabajo/i })
    expect(image).toHaveAttribute('src', '/api/momentos-file/foto%20uno.jpg')
    expect(openButton).toContainElement(image)
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('dos fotos del mismo episodio')).toBeInTheDocument()
  })

  it('renderiza fotos y nota de voz guardadas con el payload photos legado', () => {
    const { container } = render(
      <MomentoEntry
        momento={{
          ...baseMomento('foto', {
            caption: 'archivo viejo',
            photos: [
              { storageKey: 'vieja uno.jpg', width: 800, height: 600 },
              { storageKey: 'vieja-dos.jpg', width: 640, height: 480 },
            ],
            primaryStorageKey: 'vieja uno.jpg',
            audioKey: 'voz vieja.mp3',
          }),
        }}
        entitiesById={new Map()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.queryByText('(imagen no encontrada)')).toBeNull()
    expect(screen.getByRole('img', { name: /archivo viejo/i })).toHaveAttribute(
      'src',
      '/api/momentos-file/vieja%20uno.jpg',
    )
    expect(screen.getByText('+1')).toBeInTheDocument()
    const audio = container.querySelector('audio')
    expect(audio).toHaveAttribute('src', '/api/momentos-file/voz%20vieja.mp3')
  })

  it('renderiza fotos y notas de voz namespaced con slashes codificados', () => {
    const { container } = render(
      <MomentoEntry
        momento={{
          ...baseMomento('foto', {
            caption: 'foto reciente',
            items: [
              {
                storageKey: 'legacy-single-user/foto-reciente.jpg',
                width: 800,
                height: 600,
              },
            ],
            audioKey: 'legacy-single-user/voz-reciente.webm',
          }),
        }}
        entitiesById={new Map()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByRole('img', { name: /foto reciente/i })).toHaveAttribute(
      'src',
      '/api/momentos-file/legacy-single-user%2Ffoto-reciente.jpg',
    )
    const audio = container.querySelector('audio')
    expect(audio).toHaveAttribute(
      'src',
      '/api/momentos-file/legacy-single-user%2Fvoz-reciente.webm',
    )
  })
})
