import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NodeDetailPanel } from './NodeDetailPanel'
import { makeQueryClient, renderWithProviders } from '../test-utils'
import { queryKeys } from '../state/queryClient'
import type { Entity, Quote, Relationship } from '../types'

const CAMUS: Entity = {
  id: 'camus',
  type: 'persona',
  name: 'Albert Camus',
  year: 1913,
  description: 'escritor argelino-francés',
  origin: { kind: 'manual' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const EXTRANJERO: Entity = {
  id: 'extranjero',
  type: 'libro',
  name: 'El extranjero',
  year: 1942,
  origin: { kind: 'manual' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const QUOTE: Quote = {
  id: 'q1',
  entityId: 'camus',
  text: 'En el centro del invierno aprendí finalmente que había en mí un verano invencible.',
  source: 'El verano',
  linkedQuoteIds: [],
  origin: { kind: 'manual' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const REL: Relationship = {
  id: 'r1',
  fromId: 'camus',
  toId: 'extranjero',
  type: 'cita_a',
  origin: { kind: 'manual' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

function seedCache(entities: Entity[], quotes: Quote[], relationships: Relationship[]) {
  return (queryClient: ReturnType<typeof makeQueryClient>) => {
    queryClient.setQueryData(queryKeys.entities, entities)
    queryClient.setQueryData(queryKeys.quotes, quotes)
    queryClient.setQueryData(queryKeys.relationships, relationships)
    queryClient.setQueryData(queryKeys.chatThreads, [])
  }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<NodeDetailPanel />', () => {
  it('renders the entity name and metadata', () => {
    const queryClient = makeQueryClient()
    seedCache([CAMUS], [], [])(queryClient)
    renderWithProviders(<NodeDetailPanel entityId="camus" onClose={vi.fn()} />, {
      queryClient,
    })
    expect(screen.getByText('Albert Camus')).toBeInTheDocument()
    expect(screen.getByText(/escritor argelino-francés/)).toBeInTheDocument()
  })

  it('renders entity, quotes, and connections when cache is seeded', async () => {
    const queryClient = makeQueryClient()
    seedCache([CAMUS, EXTRANJERO], [QUOTE], [REL])(queryClient)

    renderWithProviders(<NodeDetailPanel entityId="camus" onClose={vi.fn()} />, {
      queryClient,
    })

    expect(screen.getByText('Albert Camus')).toBeInTheDocument()
    expect(screen.getByText(/escritor argelino-francés/)).toBeInTheDocument()
    expect(screen.getByText(/En el centro del invierno/)).toBeInTheDocument()
    expect(screen.getByText('El extranjero')).toBeInTheDocument()
  })

  it('shows "no encontrada" when entity is missing', () => {
    const queryClient = makeQueryClient()
    seedCache([], [], [])(queryClient)
    renderWithProviders(<NodeDetailPanel entityId="not-found" onClose={vi.fn()} />, {
      queryClient,
    })
    expect(screen.getByText(/no encontrada/i)).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const queryClient = makeQueryClient()
    seedCache([CAMUS], [], [])(queryClient)

    const onClose = vi.fn()
    renderWithProviders(<NodeDetailPanel entityId="camus" onClose={onClose} />, {
      queryClient,
    })

    const user = userEvent.setup()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('two-step delete: click reveals confirmation, then "sí, eliminar" fires', async () => {
    const queryClient = makeQueryClient()
    seedCache([CAMUS], [], [])(queryClient)

    // DELETE ahora devuelve { deletedAt } para alimentar el flujo de undo.
    const deleteFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ deletedAt: '2025-01-01T00:00:00Z' }),
      json: async () => ({ deletedAt: '2025-01-01T00:00:00Z' }),
    })
    vi.stubGlobal('fetch', deleteFetch)

    const onClose = vi.fn()
    renderWithProviders(<NodeDetailPanel entityId="camus" onClose={onClose} />, {
      queryClient,
    })

    const user = userEvent.setup()
    // El borrado vive ahora en el menú ⋯ del header (dos pasos: confirmar).
    await user.click(screen.getByLabelText('Más acciones'))
    await user.click(screen.getByRole('menuitem', { name: /Eliminar/ }))
    // Confirmación inline
    expect(screen.getByText(/¿Eliminar esta entidad\?/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Eliminar$/ }))

    await waitFor(() => {
      expect(deleteFetch).toHaveBeenCalledWith(
        '/api/entities/camus',
        expect.objectContaining({ method: 'DELETE' }),
      )
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('shows "ia" badge when origin.kind is ai', async () => {
    const aiEntity: Entity = {
      ...CAMUS,
      id: 'ai-entity',
      origin: { kind: 'ai', provider: 'deepseek' },
    }
    const queryClient = makeQueryClient()
    seedCache([aiEntity], [], [])(queryClient)

    renderWithProviders(<NodeDetailPanel entityId="ai-entity" onClose={vi.fn()} />, {
      queryClient,
    })

    // Chip "IA" en el header (text-xs uppercase, antes era "añadido por IA").
    expect(screen.getByText(/^IA$/i)).toBeInTheDocument()
  })
})
