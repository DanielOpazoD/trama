import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExtractBar } from './ExtractBar'
import { renderWithProviders } from '../test-utils'

function fakeFetchProposal(proposal: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(proposal),
    json: async () => proposal,
  })
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<ExtractBar />', () => {
  it('renders the textarea with placeholder', () => {
    renderWithProviders(<ExtractBar busy={false} onProposal={vi.fn()} />)
    expect(
      screen.getByPlaceholderText(/¿en qué andabas pensando\?/i),
    ).toBeInTheDocument()
  })

  it('disables the send button when input is empty', () => {
    renderWithProviders(<ExtractBar busy={false} onProposal={vi.fn()} />)
    expect(screen.getByLabelText('Extraer')).toBeDisabled()
  })

  it('enables the send button after typing', async () => {
    const user = userEvent.setup()
    renderWithProviders(<ExtractBar busy={false} onProposal={vi.fn()} />)
    const textarea = screen.getByPlaceholderText(/¿en qué andabas pensando\?/i)
    await user.type(textarea, 'algo')
    expect(screen.getByLabelText('Extraer')).toBeEnabled()
  })

  it('disables the send button when offline', () => {
    renderWithProviders(<ExtractBar busy={false} onProposal={vi.fn()} />, {
      offline: true,
    })
    expect(screen.getByLabelText('Extraer')).toBeDisabled()
    expect(screen.getByText(/Sin backend/)).toBeInTheDocument()
  })

  it('calls onProposal with the text and the API response on submit', async () => {
    const proposal = { entities: [], relationships: [], quotes: [] }
    vi.stubGlobal('fetch', fakeFetchProposal(proposal))

    const onProposal = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<ExtractBar busy={false} onProposal={onProposal} />)

    await user.type(
      screen.getByPlaceholderText(/¿en qué andabas pensando\?/i),
      'estuve leyendo Camus',
    )
    await user.click(screen.getByLabelText('Extraer'))

    await waitFor(() => {
      expect(onProposal).toHaveBeenCalledWith('estuve leyendo Camus', proposal)
    })
  })

  it('clears the textarea after a successful extraction', async () => {
    const proposal = { entities: [], relationships: [], quotes: [] }
    vi.stubGlobal('fetch', fakeFetchProposal(proposal))

    const user = userEvent.setup()
    renderWithProviders(<ExtractBar busy={false} onProposal={vi.fn()} />)

    const textarea = screen.getByPlaceholderText(
      /¿en qué andabas pensando\?/i,
    ) as HTMLTextAreaElement
    await user.type(textarea, 'algo')
    await user.click(screen.getByLabelText('Extraer'))

    await waitFor(() => expect(textarea.value).toBe(''))
  })

  it('submits on Cmd+Enter', async () => {
    const proposal = { entities: [], relationships: [], quotes: [] }
    vi.stubGlobal('fetch', fakeFetchProposal(proposal))

    const onProposal = vi.fn()
    const user = userEvent.setup()
    renderWithProviders(<ExtractBar busy={false} onProposal={onProposal} />)

    const textarea = screen.getByPlaceholderText(/¿en qué andabas pensando\?/i)
    await user.type(textarea, 'algo{Meta>}{Enter}{/Meta}')

    await waitFor(() => expect(onProposal).toHaveBeenCalled())
  })

  it('shows error message when the extraction fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => 'LLM down',
      }),
    )

    const user = userEvent.setup()
    renderWithProviders(<ExtractBar busy={false} onProposal={vi.fn()} />)

    await user.type(screen.getByPlaceholderText(/¿en qué andabas pensando\?/i), 'x')
    await user.click(screen.getByLabelText('Extraer'))

    await waitFor(() => {
      expect(screen.getByText(/502/)).toBeInTheDocument()
    })
  })
})
