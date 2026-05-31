import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NodeDetailPanel } from './NodeDetailPanel'
import { renderWithProviders } from '../test-utils'
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
  return (queryClient: ReturnType<typeof import('../test-utils').makeQueryClient>) => {
    queryClient.setQueryData(queryKeys.entities, entities)
    queryClient.setQueryData(queryKeys.quotes, quotes)
    queryClient.setQueryData(queryKeys.relationships, relationships)
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
    const { queryClient } = renderWithProviders(
      <NodeDetailPanel entityId="camus" onClose={vi.fn()} />,
    )
    seedCache([CAMUS], [], [])(queryClient)
    // Rerender after seed by re-rendering happens automatically via TanStack Query.
    // But initial render with empty cache shows "no encontrada". Render again now.
  })

  it('renders entity, quotes, and connections when cache is seeded', async () => {
    const queryClient = (await import('../test-utils')).makeQueryClient()
    queryClient.setQueryData(queryKeys.entities, [CAMUS, EXTRANJERO])
    queryClient.setQueryData(queryKeys.quotes, [QUOTE])
    queryClient.setQueryData(queryKeys.relationships, [REL])

    renderWithProviders(<NodeDetailPanel entityId="camus" onClose={vi.fn()} />, {
      queryClient,
    })

    expect(screen.getByText('Albert Camus')).toBeInTheDocument()
    // La descripción arranca colapsada: se despliega con la flecha.
    await userEvent.setup().click(screen.getByRole('button', { name: /descripción/i }))
    expect(screen.getByText(/escritor argelino-francés/)).toBeInTheDocument()
    expect(screen.getByText(/En el centro del invierno/)).toBeInTheDocument()
    expect(screen.getByText('El extranjero')).toBeInTheDocument()
  })

  it('shows "no encontrada" when entity is missing', () => {
    renderWithProviders(<NodeDetailPanel entityId="not-found" onClose={vi.fn()} />)
    expect(screen.getByText(/no encontrada/i)).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const queryClient = (await import('../test-utils')).makeQueryClient()
    queryClient.setQueryData(queryKeys.entities, [CAMUS])
    queryClient.setQueryData(queryKeys.quotes, [])
    queryClient.setQueryData(queryKeys.relationships, [])

    const onClose = vi.fn()
    renderWithProviders(<NodeDetailPanel entityId="camus" onClose={onClose} />, {
      queryClient,
    })

    const user = userEvent.setup()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('two-step delete: click reveals confirmation, then "sí, eliminar" fires', async () => {
    const queryClient = (await import('../test-utils')).makeQueryClient()
    queryClient.setQueryData(queryKeys.entities, [CAMUS])
    queryClient.setQueryData(queryKeys.quotes, [])
    queryClient.setQueryData(queryKeys.relationships, [])

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
    const queryClient = (await import('../test-utils')).makeQueryClient()
    queryClient.setQueryData(queryKeys.entities, [aiEntity])
    queryClient.setQueryData(queryKeys.quotes, [])
    queryClient.setQueryData(queryKeys.relationships, [])

    renderWithProviders(<NodeDetailPanel entityId="ai-entity" onClose={vi.fn()} />, {
      queryClient,
    })

    // Chip "IA" en el header (text-xs uppercase, antes era "añadido por IA").
    expect(screen.getByText(/^IA$/i)).toBeInTheDocument()
  })
})
