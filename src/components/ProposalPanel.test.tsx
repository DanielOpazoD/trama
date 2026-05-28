import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProposalPanel } from './ProposalPanel'
import { renderWithProviders } from '../test-utils'
import { queryKeys } from '../state/queryClient'
import type { Entity, ExtractionProposal } from '../types'

const EXISTING_ENTITY: Entity = {
  id: 'existing-camus',
  type: 'persona',
  name: 'Albert Camus',
  origin: { kind: 'manual' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const PROPOSAL: ExtractionProposal = {
  entities: [
    {
      type: 'persona',
      name: 'Iris Murdoch',
      year: 1919,
      description: 'novelista británica',
    },
    {
      matchedId: 'existing-camus',
      type: 'persona',
      name: 'Albert Camus',
    },
  ],
  relationships: [
    {
      fromName: 'Iris Murdoch',
      toName: 'Albert Camus',
      type: 'asociado_con',
    },
  ],
  quotes: [
    {
      entityName: 'Iris Murdoch',
      text: 'love is the difficult realization that something other than oneself is real',
    },
  ],
}

function mockApi(responses: Record<string, unknown>) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    // Strip query string so "POST /api/entities" matches "/api/entities?force=true".
    const path = url.split('?')[0]
    const key = `${method} ${path}`
    if (responses[key] !== undefined) {
      return Promise.resolve({
        ok: true,
        status: method === 'POST' ? 201 : 200,
        text: async () => JSON.stringify(responses[key]),
        json: async () => responses[key],
      })
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      text: async () => 'not mocked',
    })
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<ProposalPanel />', () => {
  it('renders sections for entities, relationships, and quotes', () => {
    renderWithProviders(
      <ProposalPanel
        proposal={PROPOSAL}
        sourceText="test"
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    )
    expect(screen.getByText('Entidades')).toBeInTheDocument()
    expect(screen.getByText('Relaciones')).toBeInTheDocument()
    expect(screen.getByText('Citas')).toBeInTheDocument()
    expect(screen.getAllByText('Iris Murdoch').length).toBeGreaterThan(0)
  })

  it('shows "ya existe" badge for matched entities', () => {
    renderWithProviders(
      <ProposalPanel
        proposal={PROPOSAL}
        sourceText="test"
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    )
    expect(screen.getByText('ya existe')).toBeInTheDocument()
  })

  it('shows empty state when proposal has nothing', () => {
    const empty: ExtractionProposal = { entities: [], relationships: [], quotes: [] }
    renderWithProviders(
      <ProposalPanel
        proposal={empty}
        sourceText="test"
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    )
    expect(screen.getByText(/La IA no detectó nada concreto/)).toBeInTheDocument()
  })

  it('calls onClose when discard button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <ProposalPanel
        proposal={PROPOSAL}
        sourceText="test"
        onClose={onClose}
        onConfirmed={vi.fn()}
      />,
    )
    await user.click(screen.getByText('descartar'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose on Escape key', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithProviders(
      <ProposalPanel
        proposal={PROPOSAL}
        sourceText="test"
        onClose={onClose}
        onConfirmed={vi.fn()}
      />,
    )
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('uncheckes items via checkboxes', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ProposalPanel
        proposal={PROPOSAL}
        sourceText="test"
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    )
    const checkboxes = screen.getAllByRole('checkbox')
    const firstChecked = checkboxes[0] as HTMLInputElement
    expect(firstChecked.checked).toBe(true)
    await user.click(firstChecked)
    expect(firstChecked.checked).toBe(false)
  })

  it('creates new entities and relates them on confirm', async () => {
    const createdMurdoch = {
      id: 'new-murdoch',
      type: 'persona',
      name: 'Iris Murdoch',
      year: 1919,
      description: 'novelista británica',
      position_x: null,
      position_y: null,
      origin: { kind: 'ai' },
      created_at: '2026-05-18T00:00:00Z',
      updated_at: '2026-05-18T00:00:00Z',
    }
    const createdRel = {
      id: 'new-rel',
      from_id: 'new-murdoch',
      to_id: 'existing-camus',
      type: 'asociado_con',
      notes: null,
      origin: { kind: 'ai' },
      created_at: '2026-05-18T00:00:00Z',
      updated_at: '2026-05-18T00:00:00Z',
    }
    const createdQuote = {
      id: 'new-quote',
      entity_id: 'new-murdoch',
      text: 'love is the difficult realization...',
      source: null,
      context: null,
      origin: { kind: 'ai' },
      created_at: '2026-05-18T00:00:00Z',
      updated_at: '2026-05-18T00:00:00Z',
    }
    vi.stubGlobal(
      'fetch',
      mockApi({
        'POST /api/entities': createdMurdoch,
        'POST /api/relationships': createdRel,
        'POST /api/quotes': createdQuote,
      }),
    )

    const { queryClient } = renderWithProviders(
      <ProposalPanel
        proposal={PROPOSAL}
        sourceText="test"
        onClose={vi.fn()}
        onConfirmed={vi.fn()}
      />,
    )
    // Seed the existing entity in the cache so dedup matches.
    queryClient.setQueryData(queryKeys.entities, [EXISTING_ENTITY])

    const user = userEvent.setup()
    await user.click(screen.getByText(/añadir a la trama/))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/^\/api\/entities(\?.*)?$/),
        expect.objectContaining({ method: 'POST' }),
      )
      expect(fetch).toHaveBeenCalledWith(
        '/api/relationships',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(fetch).toHaveBeenCalledWith(
        '/api/quotes',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })
})
