import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AskBar } from './AskBar'
import { renderWithProviders } from '../test-utils'

function fakeAskResponse(reply: string, proposal: unknown = null, provider = 'deepseek') {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ reply, proposal, provider }),
    json: async () => ({ reply, proposal, provider }),
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<AskBar />', () => {
  it('renders the textarea with placeholder', () => {
    renderWithProviders(
      <AskBar busy={false} view={null} selectedEntityId={null} onProposal={vi.fn()} />,
    )
    expect(screen.getByPlaceholderText(/andabas pensando|sube una foto/i)).toBeInTheDocument()
  })

  it('disables send button when empty', () => {
    renderWithProviders(
      <AskBar busy={false} view={null} selectedEntityId={null} onProposal={vi.fn()} />,
    )
    expect(screen.getByLabelText('Enviar')).toBeDisabled()
  })

  it('enables send after typing', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <AskBar busy={false} view={null} selectedEntityId={null} onProposal={vi.fn()} />,
    )
    await user.type(screen.getByPlaceholderText(/andabas pensando|sube una foto/i), 'algo')
    expect(screen.getByLabelText('Enviar')).toBeEnabled()
  })

  it('shows the reply inline when API returns one', async () => {
    vi.stubGlobal(
      'fetch',
      fakeAskResponse('Una respuesta meditativa sobre el invierno y el verano.'),
    )

    const user = userEvent.setup()
    renderWithProviders(
      <AskBar busy={false} view="citas" selectedEntityId={null} onProposal={vi.fn()} />,
    )

    await user.type(screen.getByPlaceholderText(/pega una nueva|medite/i), 'qué hago aquí')
    await user.click(screen.getByLabelText('Enviar'))

    await waitFor(() => {
      expect(screen.getByText(/respuesta meditativa/i)).toBeInTheDocument()
    })
  })

  it('calls onProposal when API returns a proposal', async () => {
    const proposal = {
      entities: [{ type: 'libro', name: 'X' }],
      relationships: [],
      quotes: [],
    }
    vi.stubGlobal('fetch', fakeAskResponse('', proposal))

    const onProposal = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <AskBar busy={false} view={null} selectedEntityId={null} onProposal={onProposal} />,
    )

    await user.type(screen.getByPlaceholderText(/andabas pensando|sube una foto/i), 'capturé esto')
    await user.click(screen.getByLabelText('Enviar'))

    await waitFor(() => {
      expect(onProposal).toHaveBeenCalledWith('capturé esto', proposal)
    })
  })

  it('shows reply AND fires onProposal when both are present', async () => {
    const proposal = {
      entities: [{ type: 'libro', name: 'X' }],
      relationships: [],
      quotes: [],
    }
    vi.stubGlobal('fetch', fakeAskResponse('contexto extra', proposal))

    const onProposal = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(
      <AskBar busy={false} view={null} selectedEntityId={null} onProposal={onProposal} />,
    )

    await user.type(screen.getByPlaceholderText(/andabas pensando|sube una foto/i), 'mixto')
    await user.click(screen.getByLabelText('Enviar'))

    await waitFor(() => {
      expect(onProposal).toHaveBeenCalled()
      expect(screen.getByText(/contexto extra/i)).toBeInTheDocument()
    })
  })

  it('clears the textarea after a successful submit', async () => {
    vi.stubGlobal('fetch', fakeAskResponse(''))

    const user = userEvent.setup()
    renderWithProviders(
      <AskBar busy={false} view={null} selectedEntityId={null} onProposal={vi.fn()} />,
    )

    const textarea = screen.getByPlaceholderText(
      /andabas pensando|sube una foto/i,
    ) as HTMLTextAreaElement
    await user.type(textarea, 'algo')
    await user.click(screen.getByLabelText('Enviar'))

    await waitFor(() => expect(textarea.value).toBe(''))
  })

  it('shows offline message when offline', () => {
    renderWithProviders(
      <AskBar busy={false} view={null} selectedEntityId={null} onProposal={vi.fn()} />,
      { offline: true },
    )
    expect(screen.getByText(/Sin backend/)).toBeInTheDocument()
    expect(screen.getByLabelText('Enviar')).toBeDisabled()
  })
})
