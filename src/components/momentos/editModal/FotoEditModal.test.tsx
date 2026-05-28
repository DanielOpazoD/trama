/**
 * Smoke tests para FotoEditModal — modal de edición de momentos foto.
 * El componente tiene 7 useState + lógica compleja de upload/compress,
 * acá cubrimos solo el rendering inicial y el wiring de los botones
 * principales. La lógica de upload/compress vive en helpers/api que
 * tienen tests propios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OfflineContext } from '../../../state/offline'
import { ToastProvider } from '../../../state/toast'
import { FotoEditModal } from './FotoEditModal'
import type { Momento } from '../../../types'

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

const FOTO_MOMENTO = {
  id: 'mom-1',
  kind: 'foto',
  capturedAt: '2026-05-28T10:00:00Z',
  note: 'una nota',
  payload: {
    photos: [{ storageKey: 'foto-1.jpg', width: 800, height: 600 }],
    primaryStorageKey: 'foto-1.jpg',
    caption: 'una foto',
  },
  links: [],
  entityIds: [],
  origin: { kind: 'manual' as const },
  createdAt: '2026-05-28T10:00:00Z',
  updatedAt: '2026-05-28T10:00:00Z',
} as unknown as Momento

beforeEach(() => vi.restoreAllMocks())
afterEach(() => vi.restoreAllMocks())

describe('<FotoEditModal />', () => {
  it('renderiza el modal con los datos del momento', () => {
    const qc = makeQueryClient()
    render(<FotoEditModal momento={FOTO_MOMENTO} onClose={() => {}} />, {
      wrapper: wrap(qc),
    })
    // El caption inicial aparece en un input
    expect(screen.getByDisplayValue('una foto')).toBeInTheDocument()
    // La note inicial también
    expect(screen.getByDisplayValue('una nota')).toBeInTheDocument()
  })

  it('botón "Cancelar" llama onClose', async () => {
    const onClose = vi.fn()
    const qc = makeQueryClient()
    render(<FotoEditModal momento={FOTO_MOMENTO} onClose={onClose} />, {
      wrapper: wrap(qc),
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('muestra al menos un botón "guardar" (submit) y "cancelar"', () => {
    const qc = makeQueryClient()
    render(<FotoEditModal momento={FOTO_MOMENTO} onClose={() => {}} />, {
      wrapper: wrap(qc),
    })
    expect(screen.getByRole('button', { name: /guardar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
  })

  it('si el momento no tiene photos, igual renderiza la shell del modal', () => {
    const empty = {
      ...FOTO_MOMENTO,
      note: '',
      payload: {
        photos: [],
        primaryStorageKey: null,
        caption: '',
      },
    } as unknown as Momento
    const qc = makeQueryClient()
    render(<FotoEditModal momento={empty} onClose={() => {}} />, { wrapper: wrap(qc) })
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument()
  })
})
