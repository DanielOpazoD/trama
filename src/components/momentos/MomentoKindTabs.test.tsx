import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { MomentoKindTabs } from './MomentoKindTabs'

describe('<MomentoKindTabs />', () => {
  test('marca el kind activo y avisa cambios', async () => {
    const onChange = vi.fn()
    render(<MomentoKindTabs kind="nota" onChange={onChange} />)

    expect(screen.getByRole('button', { name: 'Nota' })).toHaveClass('bg-paper-50')
    await userEvent.click(screen.getByRole('button', { name: 'Foto' }))

    expect(onChange).toHaveBeenCalledWith('foto')
  })
})
