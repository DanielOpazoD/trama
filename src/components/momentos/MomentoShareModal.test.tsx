import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { renderWithProviders } from '../../test-utils'
import { MomentoShareModal } from './MomentoShareModal'

describe('<MomentoShareModal />', () => {
  it('invita por email al espacio completo de Momentos y cierra al guardar', async () => {
    const create = vi.spyOn(api, 'createMomentoShareInvitation').mockResolvedValueOnce({
      id: 'inv1',
      inviterUserId: 'owner',
      inviteeEmail: 'papa@example.com',
      role: 'editor',
      status: 'pending',
      createdAt: '2026-06-10T12:00:00.000Z',
      updatedAt: '2026-06-10T12:00:00.000Z',
    })
    const onClose = vi.fn()

    renderWithProviders(<MomentoShareModal onClose={onClose} />)

    await userEvent.type(screen.getByLabelText(/correo/i), 'Papa@Example.com')
    await userEvent.click(screen.getByRole('radio', { name: /editar/i }))
    await userEvent.click(screen.getByRole('button', { name: /invitar/i }))

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(create).toHaveBeenCalledWith({
      email: 'Papa@Example.com',
      role: 'editor',
    })

    create.mockRestore()
  })
})
