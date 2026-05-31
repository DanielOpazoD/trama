/**
 * BB8: tests UI de QuoteForm (BB7-extracted). Verifica el contrato
 * básico: submit con datos completos llama api.createQuote correctamente.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Entity } from '../../types'
import { QuoteForm } from './QuoteForm'
import { makeQueryClient, renderWithProviders } from '../../test-utils'
import * as apiModule from '../../api'
import { queryKeys } from '../../state/queryClient'

const ENTITY_A: Entity = {
  id: 'ent-1',
  type: 'escritor',
  name: 'Borges',
  origin: { kind: 'manual' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(apiModule.api, 'getQuoteEchoes').mockResolvedValue([])
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('QuoteForm', () => {
  it('renderiza el select con las entidades pasadas', () => {
    const queryClient = makeQueryClient()
    queryClient.setQueryData(queryKeys.quoteEchoes('q1'), [])
    renderWithProviders(<QuoteForm entities={[ENTITY_A]} />, { queryClient })
    expect(screen.getByRole('option', { name: 'Borges' })).toBeInTheDocument()
  })

  it('no llama api.createQuote si falta entityId', async () => {
    const spy = vi.spyOn(apiModule.api, 'createQuote').mockResolvedValue({} as never)
    const queryClient = makeQueryClient()
    queryClient.setQueryData(queryKeys.quoteEchoes('q1'), [])
    renderWithProviders(<QuoteForm entities={[ENTITY_A]} />, { queryClient })
    const textarea = screen.getByPlaceholderText('La cita')
    fireEvent.change(textarea, { target: { value: 'el mundo será Tlön' } })
    fireEvent.click(screen.getByRole('button', { name: /añadir/i }))
    // Sin esperar — el guard rechaza inmediatamente.
    expect(spy).not.toHaveBeenCalled()
  })

  it('llama api.createQuote con los campos del form al submit', async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(apiModule.api, 'createQuote').mockResolvedValue({
      id: 'q1',
      entityId: 'ent-1',
      text: 'el mundo será Tlön',
      origin: { kind: 'manual' },
      linkedQuoteIds: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })
    renderWithProviders(<QuoteForm entities={[ENTITY_A]} />)

    await user.selectOptions(screen.getByRole('combobox'), 'ent-1')
    await user.type(screen.getByPlaceholderText('La cita'), 'el mundo será Tlön')
    await user.type(screen.getByPlaceholderText(/Fuente.*libro/i), 'Ficciones')
    fireEvent.click(screen.getByRole('button', { name: /añadir/i }))

    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy.mock.calls[0]![0]).toMatchObject({
      entityId: 'ent-1',
      text: 'el mundo será Tlön',
      source: 'Ficciones',
    })
  })

  it('limpia los campos tras submit exitoso', async () => {
    const user = userEvent.setup()
    vi.spyOn(apiModule.api, 'createQuote').mockResolvedValue({
      id: 'q1',
      entityId: 'ent-1',
      text: 'cita',
      origin: { kind: 'manual' },
      linkedQuoteIds: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })
    renderWithProviders(<QuoteForm entities={[ENTITY_A]} />)

    await user.selectOptions(screen.getByRole('combobox'), 'ent-1')
    const textArea = screen.getByPlaceholderText('La cita')
    await user.type(textArea, 'cita')
    fireEvent.click(screen.getByRole('button', { name: /añadir/i }))

    await waitFor(() => {
      expect((textArea as HTMLTextAreaElement).value).toBe('')
    })
  })
})
