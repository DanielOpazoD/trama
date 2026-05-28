import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AITaskSettings } from './AITaskSettings'
import type { AISettingsResponse } from '../api'
import { renderWithProviders } from '../test-utils'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const SETTINGS_FIXTURE: AISettingsResponse = {
  defaultProvider: 'deepseek',
  visionDefaultProvider: null,
  tasks: [
    { task: 'extract', provider: null, model: null, verifyWith: null, updatedAt: null },
    {
      task: 'reclassify',
      provider: 'openai',
      model: null,
      verifyWith: 'anthropic',
      updatedAt: null,
    },
    {
      task: 'suggest-relationships',
      provider: null,
      model: null,
      verifyWith: null,
      updatedAt: null,
    },
    {
      task: 'extract-image',
      provider: null,
      model: null,
      verifyWith: null,
      updatedAt: null,
    },
    { task: 'reflect', provider: null, model: null, verifyWith: null, updatedAt: null },
    { task: 'chat', provider: null, model: null, verifyWith: null, updatedAt: null },
    { task: 'panel', provider: null, model: null, verifyWith: null, updatedAt: null },
  ],
}

beforeEach(() => {
  vi.unstubAllGlobals()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<AITaskSettings />', () => {
  it('lists every task with its current provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(SETTINGS_FIXTURE))
    vi.stubGlobal('fetch', fetchMock)

    renderWithProviders(<AITaskSettings />)
    await waitFor(() => {
      expect(screen.getByText(/Extracción de texto/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Interpretación de cita/i)).toBeInTheDocument()
    expect(screen.getByText(/Reclasificar/i)).toBeInTheDocument()
  })

  it('exposes the default provider in the dropdown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(SETTINGS_FIXTURE)))
    renderWithProviders(<AITaskSettings />)
    await waitFor(() => {
      // "default (deepseek)" appears for every row with no override.
      expect(screen.getAllByText(/default \(deepseek\)/i).length).toBeGreaterThan(0)
    })
  })

  it('PUTs ai-settings when a task provider changes', async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url
      const method = init?.method ?? 'GET'
      if (url.includes('/api/ai-settings') && method === 'GET') {
        return Promise.resolve(jsonResponse(SETTINGS_FIXTURE))
      }
      if (url.includes('/api/ai-settings') && method === 'PUT') {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      return Promise.resolve(new Response('nope', { status: 404 }))
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    renderWithProviders(<AITaskSettings />)
    await waitFor(() => screen.getByText(/Extracción de texto/i))

    // Find the dropdown next to "Extracción de texto".
    const selects = screen.getAllByRole('combobox')
    // First task row's dropdown.
    await user.selectOptions(selects[0]!, 'openai')

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit | undefined)?.method === 'PUT',
      )
      expect(putCall).toBeDefined()
      const body = JSON.parse(String((putCall![1] as RequestInit).body))
      expect(body.task).toBe('extract')
      expect(body.provider).toBe('openai')
    })
  })

  it('shows the verifier dropdown only for reclassify and suggest-relationships', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(SETTINGS_FIXTURE)))
    renderWithProviders(<AITaskSettings />)
    await waitFor(() => screen.getByText(/Reclasificar/i))
    // "Verificar con un segundo modelo" line appears for 2 tasks.
    const verifyLabels = screen.getAllByText(/Verificar con un segundo modelo/i)
    expect(verifyLabels).toHaveLength(2)
  })

  it('shows a loading state before the settings query resolves', () => {
    // Never-resolves fetch so the query stays pending.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    renderWithProviders(<AITaskSettings />)
    expect(screen.getByText(/cargando/i)).toBeInTheDocument()
  })
})
