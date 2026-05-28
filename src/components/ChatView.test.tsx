import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { ChatView } from './ChatView'
import { renderWithProviders } from '../test-utils'

function jsonResp(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | Request | URL) => {
      const url = String(input)
      if (url.includes('/api/chat/threads')) {
        return jsonResp([]) // sin threads
      }
      return jsonResp([])
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<ChatView />', () => {
  it('renders the rail "conversaciones" header', async () => {
    renderWithProviders(
      <ChatView initialThreadId={null} onConsumedInitialThread={() => {}} />,
    )
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { level: 3, name: /conversaciones/i }),
      ).toBeInTheDocument()
    })
  })

  it('shows the empty hint when there are no threads', async () => {
    renderWithProviders(
      <ChatView initialThreadId={null} onConsumedInitialThread={() => {}} />,
    )
    await waitFor(() => {
      expect(
        screen.getByText(/Aún sin conversaciones/i),
      ).toBeInTheDocument()
    })
  })

  it('exposes the "+ nueva" button to create a thread', async () => {
    renderWithProviders(
      <ChatView initialThreadId={null} onConsumedInitialThread={() => {}} />,
    )
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /\+ nueva/i }),
      ).toBeInTheDocument()
    })
  })
})
