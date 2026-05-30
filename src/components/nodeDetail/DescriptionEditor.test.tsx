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

/**
 * DescriptionEditor es ahora un formulario controlado: el display de la
 * descripción vive en el header, la edición se monta sólo mientras dura y
 * avisa con `onDone` al guardar/cancelar.
 */
describe('<DescriptionEditor />', () => {
  it('renderiza el textarea con la descripción actual', () => {
    renderWithProviders(<DescriptionEditor entity={ENTITY} onDone={vi.fn()} />)
    const textarea = screen.getByPlaceholderText('descripción') as HTMLTextAreaElement
    expect(textarea.value).toBe('banda argentina de rock')
  })

  it('para tipo musical aparece el input de Spotify URL', () => {
    renderWithProviders(<DescriptionEditor entity={ENTITY} onDone={vi.fn()} />)
    expect(screen.getByPlaceholderText(/open\.spotify\.com/)).toBeInTheDocument()
  })

  it('para un libro NO aparece el input de Spotify URL', () => {
    renderWithProviders(<DescriptionEditor entity={ENTITY_BOOK} onDone={vi.fn()} />)
    expect(screen.queryByPlaceholderText(/open\.spotify\.com/)).toBeNull()
  })

  it('click en "Cancelar" llama onDone', async () => {
    const onDone = vi.fn()
    renderWithProviders(<DescriptionEditor entity={ENTITY} onDone={onDone} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Cancelar/i }))
    expect(onDone).toHaveBeenCalled()
  })

  it('PATCH se dispara al guardar cambios y luego llama onDone', async () => {
    const patchFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ...ENTITY, description: 'nueva descripción' }),
      json: async () => ({ ...ENTITY, description: 'nueva descripción' }),
    })
    vi.stubGlobal('fetch', patchFetch)

    const onDone = vi.fn()
    renderWithProviders(<DescriptionEditor entity={ENTITY} onDone={onDone} />)
    const user = userEvent.setup()

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
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('si nada cambió, el guardado no dispara PATCH pero igual llama onDone', async () => {
    const patchFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(ENTITY),
      json: async () => ENTITY,
    })
    vi.stubGlobal('fetch', patchFetch)

    const onDone = vi.fn()
    renderWithProviders(<DescriptionEditor entity={ENTITY} onDone={onDone} />)
    const user = userEvent.setup()
    // No tocamos el textarea — click directo a Guardar
    await user.click(screen.getByRole('button', { name: /^Guardar/i }))

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(patchFetch).not.toHaveBeenCalled()
  })
})
