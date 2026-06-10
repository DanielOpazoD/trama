import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { renderWithProviders } from '../../test-utils'
import type { Momento } from '../../types'
import { MomentoShareModal } from './MomentoShareModal'

const momento: Momento = {
  id: 'm1',
  kind: 'nota',
  capturedAt: '2026-06-10T12:00:00.000Z',
  payload: { bodyText: 'Reunión del colegio.' },
  origin: { kind: 'manual' },
  entityIds: [],
  accessRole: 'owner',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-10T12:00:00.000Z',
}

describe('<MomentoShareModal />', () => {
  it('invita por email con rol editor y cierra al guardar', async () => {
    const create = vi.spyOn(api, 'createMomentoShareInvitation').mockResolvedValueOnce({
      id: 'inv1',
      momentoId: 'm1',
      inviterUserId: 'owner',
      inviteeEmail: 'papa@example.com',
      role: 'editor',
      status: 'pending',
      createdAt: '2026-06-10T12:00:00.000Z',
      updatedAt: '2026-06-10T12:00:00.000Z',
      momento: { kind: 'nota', capturedAt: '2026-06-10T12:00:00.000Z' },
    })
    const onClose = vi.fn()

    renderWithProviders(<MomentoShareModal momento={momento} onClose={onClose} />)

    await userEvent.type(screen.getByLabelText(/correo/i), 'Papa@Example.com')
    await userEvent.click(screen.getByRole('radio', { name: /editar/i }))
    await userEvent.click(screen.getByRole('button', { name: /invitar/i }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith({
      momentoId: 'm1',
      email: 'Papa@Example.com',
      role: 'editor',
    })

    create.mockRestore()
  })
})
