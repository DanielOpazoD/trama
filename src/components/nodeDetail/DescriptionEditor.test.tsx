import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DescriptionEditor } from './DescriptionEditor'
import { renderWithProviders } from '../../test-utils'
import type { Entity } from '../../types'

const ENTITY: Entity = {
  id: 'e1',
  type: 'musico',
  name: 'Soda Stereo',
  description: 'banda argentina de rock',
  spotifyUrl: 'https://open.spotify.com/artist/abc',
  origin: { kind: 'manual' },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const ENTITY_NO_DESC: Entity = {
  ...ENTITY,
  id: 'e2',
  name: 'X',
  description: undefined,
  spotifyUrl: undefined,
}

const ENTITY_BOOK: Entity = {
  ...ENTITY,
  id: 'e3',
  type: 'libro',
  name: 'Rayuela',
  spotifyUrl: undefined,
}

beforeEach(() => {
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<DescriptionEditor />', () => {
  it('muestra la descripción en modo vista', () => {
    renderWithProviders(<DescriptionEditor entity={ENTITY} />)
    expect(screen.getByText('banda argentina de rock')).toBeInTheDocument()
  })

  it('muestra "sin descripción" cuando no hay description', () => {
    renderWithProviders(<DescriptionEditor entity={ENTITY_NO_DESC} />)
    expect(screen.getByText(/sin descripción/i)).toBeInTheDocument()
  })

  it('click en "editar" pasa al modo edición', async () => {
    renderWithProviders(<DescriptionEditor entity={ENTITY} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /editar/i }))
    // Textarea aparece con la descripción actual
    const textarea = screen.getByPlaceholderText('descripción') as HTMLTextAreaElement
    expect(textarea.value).toBe('banda argentina de rock')
  })

  it('en modo edición de tipo musical aparece el input de Spotify URL', async () => {
    renderWithProviders(<DescriptionEditor entity={ENTITY} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /editar/i }))
    expect(screen.getByPlaceholderText(/open\.spotify\.com/)).toBeInTheDocument()
  })

  it('en modo edición de un libro NO aparece el input de Spotify URL', async () => {
    renderWithProviders(<DescriptionEditor entity={ENTITY_BOOK} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /editar/i }))
    expect(screen.queryByPlaceholderText(/open\.spotify\.com/)).toBeNull()
  })

  it('click en "Cancelar" vuelve al modo vista y restaura el draft', async () => {
    renderWithProviders(<DescriptionEditor entity={ENTITY} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /editar/i }))
    const textarea = screen.getByPlaceholderText('descripción') as HTMLTextAreaElement
    await user.clear(textarea)
    await user.type(textarea, 'otro texto')
    await user.click(screen.getByRole('button', { name: /Cancelar/i }))
    // El texto original sigue ahí
    expect(screen.getByText('banda argentina de rock')).toBeInTheDocument()
  })

  it('PATCH se dispara al guardar cambios', async () => {
    const patchFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ...ENTITY, description: 'nueva descripción' }),
      json: async () => ({ ...ENTITY, description: 'nueva descripción' }),
    })
    vi.stubGlobal('fetch', patchFetch)

    renderWithProviders(<DescriptionEditor entity={ENTITY} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /editar/i }))

    const textarea = screen.getByPlaceholderText('descripción') as HTMLTextAreaElement
    await user.clear(textarea)
    await user.type(textarea, 'nueva descripción')

    await user.click(screen.getByRole('button', { name: /^Guardar/i }))

    await waitFor(() =>
      expect(patchFetch).toHaveBeenCalledWith(
        '/api/entities/e1',
        expect.objectContaining({ method: 'PATCH' }),
      ),
    )
  })

  it('si el textarea no cambió, el guardado no dispara PATCH', async () => {
    const patchFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(ENTITY),
      json: async () => ENTITY,
    })
    vi.stubGlobal('fetch', patchFetch)

    renderWithProviders(<DescriptionEditor entity={ENTITY} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /editar/i }))
    // No tocamos el textarea — click directo a Guardar
    await user.click(screen.getByRole('button', { name: /^Guardar/i }))

    // El componente vuelve a modo vista sin hacer fetch
    await waitFor(() => {
      expect(screen.getByText('banda argentina de rock')).toBeInTheDocument()
    })
    expect(patchFetch).not.toHaveBeenCalled()
  })
})
