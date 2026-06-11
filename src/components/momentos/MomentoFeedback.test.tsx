import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as apiModule from '../../api'
import { MomentoFeedback } from './MomentoFeedback'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
}

function wrapWith(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('<MomentoFeedback />', () => {
  it('muestra actividad familiar y permite reaccionar', async () => {
    vi.spyOn(apiModule.api, 'getMomentoFeedback').mockResolvedValue({
      comments: [
        {
          id: 'c1',
          momentoId: 'mom-1',
          authorUserId: 'user-mama',
          authorDisplayName: 'Mamá',
          body: 'Me encanta esta foto.',
          createdAt: '2026-06-11T12:00:00Z',
          updatedAt: '2026-06-11T12:00:00Z',
          canDelete: true,
        },
      ],
      reactions: [{ reaction: 'heart', count: 2, reactedByMe: false }],
    })
    const setReaction = vi
      .spyOn(apiModule.api, 'setMomentoReaction')
      .mockResolvedValue({ reaction: { reaction: 'heart', count: 3, reactedByMe: true } })

    render(<MomentoFeedback momentoId="mom-1" />, {
      wrapper: wrapWith(makeQueryClient()),
    })

    expect(await screen.findByText('Mamá')).toBeInTheDocument()
    expect(screen.getByText('Me encanta esta foto.')).toBeInTheDocument()
    expect(screen.getByText('11 jun, 12:00')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { pressed: false }))

    await waitFor(() =>
      expect(setReaction).toHaveBeenCalledWith({ momentoId: 'mom-1', reaction: 'heart' }),
    )
  })

  it('crea un comentario breve desde la misma entrada', async () => {
    vi.spyOn(apiModule.api, 'getMomentoFeedback').mockResolvedValue({
      comments: [],
      reactions: [],
    })
    const createComment = vi
      .spyOn(apiModule.api, 'createMomentoComment')
      .mockResolvedValue({
        comment: {
          id: 'c2',
          momentoId: 'mom-1',
          authorUserId: 'user-papa',
          authorDisplayName: 'Papá',
          body: 'Queda para el libro familiar.',
          createdAt: '2026-06-11T12:10:00Z',
          updatedAt: '2026-06-11T12:10:00Z',
        },
      })

    render(<MomentoFeedback momentoId="mom-1" />, {
      wrapper: wrapWith(makeQueryClient()),
    })

    await userEvent.click(screen.getByRole('button', { expanded: false }))
    await userEvent.type(
      screen.getByPlaceholderText('Comentar este momento'),
      'Queda para el libro familiar.',
    )
    await userEvent.click(screen.getByRole('button', { name: /enviar/i }))

    await waitFor(() =>
      expect(createComment).toHaveBeenCalledWith({
        momentoId: 'mom-1',
        body: 'Queda para el libro familiar.',
      }),
    )
  })

  it('permite eliminar comentarios cuando el contrato entrega permiso', async () => {
    vi.spyOn(apiModule.api, 'getMomentoFeedback').mockResolvedValue({
      comments: [
        {
          id: 'c3',
          momentoId: 'mom-1',
          authorUserId: 'user-mama',
          authorDisplayName: 'Mamá',
          body: 'Comentario moderable.',
          createdAt: '2026-06-11T12:00:00Z',
          updatedAt: '2026-06-11T12:00:00Z',
          canDelete: true,
        },
      ],
      reactions: [],
    })
    const deleteComment = vi
      .spyOn(apiModule.api, 'deleteMomentoComment')
      .mockResolvedValue({ deleted: true })

    render(<MomentoFeedback momentoId="mom-1" />, {
      wrapper: wrapWith(makeQueryClient()),
    })

    expect(await screen.findByText('Comentario moderable.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /eliminar comentario/i }))

    await waitFor(() =>
      expect(deleteComment).toHaveBeenCalledWith({
        momentoId: 'mom-1',
        commentId: 'c3',
      }),
    )
  })
})
