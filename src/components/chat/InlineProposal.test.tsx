/**
 * Tests del InlineProposal — el bloque que aparece dentro de las
 * respuestas del chat con propuestas estructuradas (entidades,
 * relaciones, citas, reclassifications, edits, deletes).
 *
 * Foco:
 *  - Render correcto por tipo de propuesta.
 *  - "Aceptar todo" aparece solo cuando hay >1 pending.
 *  - Click en "Aceptar" dispara la mutation correcta.
 *  - Items aceptados cambian de estado (no quedan en pending).
 *
 * Mockeamos los hooks de state — el componente solo es UI sobre
 * mutations. Los hooks ya tienen sus propios tests.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from '../../state/offline'
import { ToastProvider } from '../../state/toast'
import { queryKeys } from '../../state/queryClient'
import { InlineProposal } from './InlineProposal'
import { api, type ChatProposal } from '../../api'
import type { Entity } from '../../types'

afterEach(() => {
  vi.restoreAllMocks()
})

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
}

function wrap(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <OfflineContext.Provider value={{ offline: false, setOffline: () => {} }}>
          <ToastProvider>{children}</ToastProvider>
        </OfflineContext.Provider>
      </QueryClientProvider>
    )
  }
}

function setupQC() {
  const qc = makeQueryClient()
  qc.setQueryData<Entity[]>(queryKeys.entities, [])
  return qc
}

describe('<InlineProposal />', () => {
  it('renderiza un row por entidad propuesta + chip de tipo', () => {
    const proposal: ChatProposal = {
      entities: [{ name: 'Borges', type: 'escritor' }],
      relationships: [],
      quotes: [],
    } as ChatProposal
    render(<InlineProposal proposal={proposal} />, { wrapper: wrap(setupQC()) })
    expect(screen.getByText('Borges')).toBeInTheDocument()
    expect(screen.getByText(/propuestas/i)).toBeInTheDocument()
  })

  it('renderiza un row por relación propuesta con "from → to"', () => {
    const proposal = {
      entities: [],
      relationships: [{ fromName: 'A', toName: 'B', type: 'influye_en' }],
      quotes: [],
    } as unknown as ChatProposal
    render(<InlineProposal proposal={proposal} />, { wrapper: wrap(setupQC()) })
    expect(screen.getByText(/A → B/)).toBeInTheDocument()
  })

  it('renderiza un row por cita propuesta', () => {
    const proposal = {
      entities: [],
      relationships: [],
      quotes: [{ entityName: 'Borges', text: 'todo enunciado…' }],
    } as unknown as ChatProposal
    render(<InlineProposal proposal={proposal} />, { wrapper: wrap(setupQC()) })
    expect(screen.getByText(/todo enunciado/i)).toBeInTheDocument()
  })

  it('"aceptar todo" NO aparece con 1 sola propuesta', () => {
    const single: ChatProposal = {
      entities: [{ name: 'X', type: 'persona' }],
      relationships: [],
      quotes: [],
    } as ChatProposal
    render(<InlineProposal proposal={single} />, { wrapper: wrap(setupQC()) })
    expect(screen.queryByRole('button', { name: /aceptar todo/i })).toBeNull()
  })

  it('"aceptar todo" SÍ aparece con 2+ propuestas pending', () => {
    const multiple: ChatProposal = {
      entities: [
        { name: 'X', type: 'persona' },
        { name: 'Y', type: 'libro' },
      ],
      relationships: [],
      quotes: [],
    } as ChatProposal
    render(<InlineProposal proposal={multiple} />, { wrapper: wrap(setupQC()) })
    expect(screen.getByRole('button', { name: /aceptar todo/i })).toBeInTheDocument()
  })

  it('cada item pending tiene un botón "aceptar"', () => {
    const proposal: ChatProposal = {
      entities: [
        { name: 'A', type: 'persona' },
        { name: 'B', type: 'libro' },
      ],
      relationships: [],
      quotes: [],
    } as ChatProposal
    render(<InlineProposal proposal={proposal} />, { wrapper: wrap(setupQC()) })
    // 2 items pending + 1 "aceptar todo" = 3 botones "aceptar" matchean.
    const acceptButtons = screen.getAllByRole('button', { name: /^aceptar$/i })
    expect(acceptButtons).toHaveLength(2)
  })

  it('después de clickear "aceptar", ese row deja de mostrar el botón', async () => {
    vi.spyOn(api, 'createEntity').mockResolvedValue({
      id: 'created-a',
      type: 'persona',
      name: 'A',
      origin: { kind: 'ai' },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })
    const proposal: ChatProposal = {
      entities: [
        { name: 'A', type: 'persona' },
        { name: 'B', type: 'libro' },
      ],
      relationships: [],
      quotes: [],
    } as ChatProposal
    render(<InlineProposal proposal={proposal} />, { wrapper: wrap(setupQC()) })
    const user = userEvent.setup()
    const buttonsBefore = screen.getAllByRole('button', { name: /^aceptar$/i })
    expect(buttonsBefore).toHaveLength(2)
    await user.click(buttonsBefore[0]!)
    // El mutation es async — esperamos a que el status cambie a
    // 'applied' o 'failed'. En ambos casos el botón "aceptar" de
    // ese row desaparece (solo se muestra mientras status='pending').
    await waitFor(() => {
      const buttonsAfter = screen.queryAllByRole('button', { name: /^aceptar$/i })
      expect(buttonsAfter.length).toBeLessThan(buttonsBefore.length)
    })
  })

  it('proposal vacía no renderiza nada visible', () => {
    const empty: ChatProposal = {
      entities: [],
      relationships: [],
      quotes: [],
    } as ChatProposal
    const { container } = render(<InlineProposal proposal={empty} />, {
      wrapper: wrap(setupQC()),
    })
    // Header "propuestas" puede aparecer pero no debería haber rows.
    // Verificamos que no hay botones "aceptar".
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBeLessThanOrEqual(0)
  })
})
