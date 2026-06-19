import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RecorteSuggestion } from '../../api'
import { RecorteSuggestionBanner } from './RecorteSuggestionBanner'

describe('<RecorteSuggestionBanner />', () => {
  it('muestra la sugerencia y permite usarla', async () => {
    const user = userEvent.setup()
    const onUse = vi.fn()
    const suggestion: RecorteSuggestion = {
      target: 'momento',
      title: 'Una escena',
      rationale: 'Parece una vivencia narrable.',
      relatedEntityIds: ['e1'],
      suggestedEntityName: null,
      suggestedEntityType: null,
      relatedEntities: [{ id: 'e1', name: 'Rapa Nui', type: 'lugar' }],
    }

    render(<RecorteSuggestionBanner suggestion={suggestion} onUse={onUse} />)

    expect(screen.getByText(/Una escena/)).toBeInTheDocument()
    expect(screen.getByText(/Rapa Nui/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /usar sugerencia/ }))
    expect(onUse).toHaveBeenCalledTimes(1)
  })
})
