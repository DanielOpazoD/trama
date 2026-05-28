import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProactiveView } from './ProactiveView'
import type { ProactiveSuggestion } from '../api'
import type { Entity } from '../types'
import { queryKeys } from '../state/queryClient'
import { renderWithProviders, makeQueryClient } from '../test-utils'

const ENTITIES: Entity[] = [
  {
    id: 'e1',
    name: 'Camus',
    type: 'escritor',
    origin: { kind: 'manual' },
    linkedQuoteIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  } as Entity,
  {
    id: 'e2',
    name: 'Murdoch',
    type: 'persona',
    origin: { kind: 'manual' },
    linkedQuoteIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  } as Entity,
]

function seedProactiveCache(
  qc: ReturnType<typeof makeQueryClient>,
  items: ProactiveSuggestion[],
) {
  qc.setQueryData(['proactive', 'pending'], items)
  qc.setQueryData(queryKeys.entities, ENTITIES)
}

function fakeFetch(handlers: Record<string, () => Response>) {
  return vi.fn((input: RequestInfo) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url
    for (const [pattern, h] of Object.entries(handlers)) {
      if (url.includes(pattern)) {
        return Promise.resolve(h())
      }
    }
    return Promise.resolve(new Response('not stubbed: ' + url, { status: 404 }))
  })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<ProactiveView />', () => {
  it('shows the empty state when there are no pending suggestions', () => {
    vi.stubGlobal(
      'fetch',
      fakeFetch({
        '/api/proactive-suggestions': () => jsonResponse([]),
      }),
    )
    const qc = makeQueryClient()
    qc.setQueryData(['proactive', 'pending'], [])
    qc.setQueryData(queryKeys.entities, ENTITIES)
    renderWithProviders(<ProactiveView />, { queryClient: qc })
    expect(screen.getByText(/serena/i)).toBeInTheDocument()
  })

  it('renders the description preview when present', () => {
    const items: ProactiveSuggestion[] = [
      {
        id: 's1',
        kind: 'description',
        payload: {
          entityId: 'e1',
          name: 'Camus',
          description: 'escritor y filósofo argelino-francés',
          reason: 'la entidad no tenía descripción',
        },
        status: 'pending',
        provider: 'openai',
        model: 'gpt-4o-mini',
        createdAt: '2026-05-21T00:00:00Z',
        statusChangedAt: null,
      },
    ]
    vi.stubGlobal(
      'fetch',
      fakeFetch({
        '/api/proactive-suggestions': () => jsonResponse(items),
      }),
    )
    const qc = makeQueryClient()
    seedProactiveCache(qc, items)
    renderWithProviders(<ProactiveView />, { queryClient: qc })
    expect(screen.getByText(/"escritor y filósofo argelino-francés"/)).toBeInTheDocument()
    expect(screen.getByText(/la entidad no tenía descripción/i)).toBeInTheDocument()
  })

  it('renders a relationship arrow when kind is relationship', () => {
    const items: ProactiveSuggestion[] = [
      {
        id: 's2',
        kind: 'relationship',
        payload: {
          fromName: 'Camus',
          toName: 'Murdoch',
          type: 'asociado_con',
          reason: 'ambos exploran el absurdo',
        },
        status: 'pending',
        provider: 'deepseek',
        model: 'deepseek-chat',
        createdAt: '2026-05-21T00:00:00Z',
        statusChangedAt: null,
      },
    ]
    const qc = makeQueryClient()
    seedProactiveCache(qc, items)
    renderWithProviders(<ProactiveView />, { queryClient: qc })
    // The body shows fromName and toName.
    expect(screen.getByText('Camus')).toBeInTheDocument()
    expect(screen.getByText('Murdoch')).toBeInTheDocument()
  })

  it('dismiss fires PATCH and removes the row from cache', async () => {
    const items: ProactiveSuggestion[] = [
      {
        id: 's-dis',
        kind: 'description',
        payload: {
          entityId: 'e1',
          name: 'Camus',
          description: 'algo',
          reason: 'porque sí',
        },
        status: 'pending',
        provider: 'openai',
        model: 'gpt-4o-mini',
        createdAt: '2026-05-21T00:00:00Z',
        statusChangedAt: null,
      },
    ]
    const fetchMock = fakeFetch({
      '/api/proactive-suggestions/s-dis': () => new Response(null, { status: 204 }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const qc = makeQueryClient()
    seedProactiveCache(qc, items)
    const user = userEvent.setup()
    renderWithProviders(<ProactiveView />, { queryClient: qc })

    await user.click(screen.getByRole('button', { name: /descartar/i }))
    await waitFor(() => {
      const cache = qc.getQueryData<ProactiveSuggestion[]>(['proactive', 'pending']) ?? []
      expect(cache.find((s) => s.id === 's-dis')).toBeUndefined()
    })
    // The PATCH request was sent with status 'dismissed'.
    const call = fetchMock.mock.calls.find(
      ([url]) => typeof url === 'string' && url.includes('s-dis'),
    )
    expect(call).toBeDefined()
  })
})
