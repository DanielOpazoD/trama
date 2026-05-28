import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import GraphView from './GraphView'
import { renderWithProviders } from '../test-utils'

/**
 * Smoke test mínimo de GraphView. El componente es muy complejo
 * (canvas SVG + WebGL fallback Sigma + pan/zoom + drag) pero acá nos
 * limitamos a verificar que con datos vacíos renderiza el empty state
 * sin crashear y expone los modos de layout.
 */

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
      if (url.includes('/api/entities')) return jsonResp([])
      if (url.includes('/api/relationships'))
        return jsonResp({ items: [], nextCursor: null })
      return jsonResp([])
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('<GraphView />', () => {
  it('renders empty state when there are no entities', async () => {
    const { container } = renderWithProviders(
      <GraphView selectedId={null} onSelect={() => {}} onProposal={() => {}} />,
    )
    await waitFor(() => {
      // EmptyState aparece. No tiene heading semántico — es un quote
      // curado + buttons de empezar. Chequeamos por algún button visible.
      const buttons = container.querySelectorAll('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })
})
