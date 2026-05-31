import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
      expect(screen.getByText(/Aún sin conversaciones/i)).toBeInTheDocument()
    })
  })

  it('exposes the "+ nueva" button to create a thread', async () => {
    renderWithProviders(
      <ChatView initialThreadId={null} onConsumedInitialThread={() => {}} />,
    )
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /\+ nueva/i })).toBeInTheDocument()
    })
  })

  it('no oculta dependencias de hooks al consumir initialThreadId', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/ChatView.tsx'),
      'utf8',
    )
    expect(source).not.toContain('eslint-disable-next-line react-hooks/exhaustive-deps')
  })

  /**
   * Regresión: el header del pane de conversación es una excepción
   * deliberada al patrón `<ViewHeader />` (ver
   * docs/conventions/filosofia-estetica.md §6.2). Su título cambia con
   * `activeThread.title` y el subtítulo con
   * `threadSubtitle(activeThread.context)`. Estos dos tests blindan esa
   * propiedad — si alguien lo normaliza a un ViewHeader con título
   * fijo "Chat", fallan.
   */
  describe('header de conversación (excepción a ViewHeader, filosofía §6.2)', () => {
    it('h2 del pane muestra el título del hilo activo (no un título fijo)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | Request | URL) => {
          const url = String(input)
          if (url.includes('/api/chat/threads')) {
            return jsonResp([
              {
                id: 'thread-1',
                title: 'Mi conversación específica',
                context: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ])
          }
          if (url.includes('/api/chat/messages')) {
            return jsonResp([])
          }
          return jsonResp([])
        }),
      )
      renderWithProviders(
        <ChatView initialThreadId="thread-1" onConsumedInitialThread={() => {}} />,
      )
      await waitFor(() => {
        expect(
          screen.getByRole('heading', {
            level: 2,
            name: /mi conversación específica/i,
          }),
        ).toBeInTheDocument()
      })
    })

    it('subtítulo se deriva de threadSubtitle(activeThread.context)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string | Request | URL) => {
          const url = String(input)
          if (url.includes('/api/chat/threads')) {
            return jsonResp([
              {
                id: 'thread-2',
                title: 'Sobre citas',
                context: 'citas',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ])
          }
          if (url.includes('/api/chat/messages')) {
            return jsonResp([])
          }
          return jsonResp([])
        }),
      )
      renderWithProviders(
        <ChatView initialThreadId="thread-2" onConsumedInitialThread={() => {}} />,
      )
      // threadSubtitle('citas') → "Iniciado desde Citas."
      await waitFor(() => {
        expect(screen.getByText(/iniciado desde citas/i)).toBeInTheDocument()
      })
    })
  })
})
