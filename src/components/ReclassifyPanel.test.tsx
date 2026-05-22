import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReclassifyPanel } from './ReclassifyPanel'
import type { Reclassification } from '../api'
import { renderWithProviders } from '../test-utils'

const TWO_PROPOSALS: Reclassification[] = [
  {
    id: 'e1',
    name: 'Pink Floyd',
    oldType: 'persona',
    newType: 'banda',
    reason: 'es una banda',
  },
  {
    id: 'e2',
    name: 'Iris Murdoch',
    oldType: 'persona',
    newType: 'escritor',
    reason: 'es una novelista',
  },
]

describe('<ReclassifyPanel />', () => {
  it('renders one row per proposal with before/after types', () => {
    renderWithProviders(
      <ReclassifyPanel proposals={TWO_PROPOSALS} onApply={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByText('Pink Floyd')).toBeInTheDocument()
    expect(screen.getByText('Iris Murdoch')).toBeInTheDocument()
    // The new type label "banda / grupo" appears as a per-row chip.
    expect(screen.getAllByText(/banda \/ grupo/i).length).toBeGreaterThan(0)
  })

  it('all proposals start checked', () => {
    renderWithProviders(
      <ReclassifyPanel proposals={TWO_PROPOSALS} onApply={vi.fn()} onClose={vi.fn()} />,
    )
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    for (const cb of checkboxes) {
      expect(cb).toBeChecked()
    }
  })

  it('unchecking reduces the apply count', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ReclassifyPanel proposals={TWO_PROPOSALS} onApply={vi.fn()} onClose={vi.fn()} />,
    )
    // With both checked, button reads "aplicar todo".
    expect(screen.getByRole('button', { name: /aplicar todo/i })).toBeInTheDocument()
    const [first] = screen.getAllByRole('checkbox')
    await user.click(first)
    // Now only one is selected, button shows "aplicar 1".
    expect(screen.getByRole('button', { name: /aplicar 1/i })).toBeInTheDocument()
  })

  it('apply button passes only checked proposals to onApply', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    renderWithProviders(
      <ReclassifyPanel proposals={TWO_PROPOSALS} onApply={onApply} onClose={vi.fn()} />,
    )
    const [first] = screen.getAllByRole('checkbox')
    await user.click(first) // uncheck Pink Floyd
    await user.click(screen.getByRole('button', { name: /aplicar 1/i }))
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1))
    const passed = onApply.mock.calls[0][0] as Reclassification[]
    expect(passed).toHaveLength(1)
    expect(passed[0].id).toBe('e2')
  })

  it('discard fires onClose', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <ReclassifyPanel proposals={TWO_PROPOSALS} onApply={vi.fn()} onClose={onClose} />,
    )
    await user.click(screen.getByRole('button', { name: /descartar/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows verification chip when verification.agreed is true', () => {
    const withVerify: Reclassification[] = [
      {
        ...TWO_PROPOSALS[0],
        verification: { agreed: true, verifier: 'anthropic' },
      },
    ]
    renderWithProviders(
      <ReclassifyPanel proposals={withVerify} onApply={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByText(/verificado por anthropic/i)).toBeInTheDocument()
  })

  it('shows doubt chip with note when verifier disagreed', () => {
    const withVerify: Reclassification[] = [
      {
        ...TWO_PROPOSALS[0],
        verification: { agreed: false, verifier: 'openai', note: 'no estoy seguro' },
      },
    ]
    renderWithProviders(
      <ReclassifyPanel proposals={withVerify} onApply={vi.fn()} onClose={vi.fn()} />,
    )
    expect(screen.getByText(/openai dudó/i)).toBeInTheDocument()
    expect(screen.getByText(/no estoy seguro/i)).toBeInTheDocument()
  })
})
