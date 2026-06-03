import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { NoteCard } from './NoteCard'
import type { Note } from '../../api'
import { renderWithProviders } from '../../test-utils'

const BASE: Note = {
  id: 'n1',
  content: 'una nota',
  tags: [],
  pinned: false,
  promotedMomentoId: null,
  createdAt: '2026-05-29T10:00:00.000Z',
  updatedAt: '2026-05-29T10:00:00.000Z',
}

const noop = () => {}

function stubAttachments(rows: unknown[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  )
}

beforeEach(() => stubAttachments([]))
afterEach(() => vi.unstubAllGlobals())

function renderCard(note: Note, overrides: Partial<Parameters<typeof NoteCard>[0]> = {}) {
  return renderWithProviders(
    <NoteCard
      note={note}
      onTogglePin={noop}
      onDelete={noop}
      onPromote={noop}
      onEdit={noop}
      {...overrides}
    />,
  )
}

const openMenu = () =>
  fireEvent.click(screen.getByRole('button', { name: /acciones de la nota/i }))

describe('<NoteCard />', () => {
  it('la cara muestra solo el texto; las acciones viven tras el menú', () => {
    renderCard(BASE)
    expect(screen.getByText('una nota')).toBeInTheDocument()
    // Sin botones de acción sueltos en la cara (están dentro del menú cerrado).
    expect(screen.queryByRole('menuitem')).toBeNull()
    expect(screen.queryByRole('button', { name: /^editar$/i })).toBeNull()
    expect(
      screen.getByRole('button', { name: /acciones de la nota/i }),
    ).toBeInTheDocument()
  })

  it('promueve a Momento desde el menú cuando no fue promovida', () => {
    const onPromote = vi.fn()
    renderCard(BASE, { onPromote })
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /momento/i }))
    expect(onPromote).toHaveBeenCalledTimes(1)
  })

  it('promovida: sin opción de Momento, muestra "Ya vive como Momento"', () => {
    renderCard({ ...BASE, promotedMomentoId: 'm1' })
    openMenu()
    expect(screen.getByText(/ya vive como momento/i)).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /→ momento/i })).toBeNull()
  })

  it('permite editar el contenido (campo autoexpandible)', () => {
    const onEdit = vi.fn()
    renderCard(BASE, { onEdit })
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /editar/i }))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'nueva versión' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(onEdit).toHaveBeenCalledWith('nueva versión')
  })

  it('borrar pide confirmación dentro del menú', () => {
    const onDelete = vi.fn()
    renderCard(BASE, { onDelete })
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /^borrar$/i }))
    expect(onDelete).not.toHaveBeenCalled() // primer clic solo pide confirmar
    fireEvent.click(screen.getByRole('menuitem', { name: /sí, borrar/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('el menú alterna el panel de anexos (sin perder archivos)', () => {
    renderCard(BASE)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /^anexos$/i }))
    // Se montó el panel de anexos…
    expect(screen.getByText('anexos')).toBeInTheDocument()
    // …y el menú refleja el estado al reabrir.
    openMenu()
    expect(screen.getByRole('menuitem', { name: /ocultar anexos/i })).toBeInTheDocument()
  })

  it('una nota fijada expone su estado a lectores de pantalla', () => {
    renderCard({ ...BASE, pinned: true })
    expect(screen.getByText('Nota fijada')).toBeInTheDocument()
  })

  it('muestra el ícono de fotos solo si hay imágenes adjuntas', async () => {
    stubAttachments([
      {
        id: 'a1',
        owner_type: 'note',
        owner_id: 'n1',
        file_name: 'f.jpg',
        mime_type: 'image/jpeg',
        byte_size: 10,
        storage_key: 'u1/f.jpg',
        created_at: 'x',
        updated_at: 'x',
      },
    ])
    renderCard(BASE)
    expect(await screen.findByRole('button', { name: /ver fotos/i })).toBeInTheDocument()
  })
})
