import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import GraphView, { graphViewportFitKey } from './GraphView'
import { renderWithProviders } from '../test-utils'

const graphFitToView = vi.hoisted(() => vi.fn())

vi.mock('../hooks/usePanZoom', () => ({
  usePanZoom: () => ({
    pan: { x: 0, y: 0 },
    zoom: 0.7,
    isPanning: false,
    onMouseDown: vi.fn(),
    onMouseMove: vi.fn(),
    onMouseUp: vi.fn(),
    onWheel: vi.fn(),
    screenToWorld: vi.fn(() => ({ x: 0, y: 0 })),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    resetView: vi.fn(),
    setPanTo: vi.fn(),
    fitToView: graphFitToView,
    isDragging: vi.fn(() => false),
    startDrag: vi.fn(),
    cancelDrag: vi.fn(),
    draggingId: vi.fn(() => null),
  }),
}))

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

const graphEntities = [
  {
    id: 'e1',
    name: 'Borges',
    type: 'escritor',
    description: null,
    essay: null,
    year: 1899,
    origin: { kind: 'manual' },
    spotifyUrl: null,
    position: null,
    createdAt: '2026-06-17T10:00:00.000Z',
    updatedAt: '2026-06-17T10:00:00.000Z',
  },
  {
    id: 'e2',
    name: 'Bioy',
    type: 'escritor',
    description: null,
    essay: null,
    year: 1914,
    origin: { kind: 'manual' },
    spotifyUrl: null,
    position: null,
    createdAt: '2026-06-17T10:00:00.000Z',
    updatedAt: '2026-06-17T10:00:00.000Z',
  },
]

const graphRelationships = {
  items: [
    {
      id: 'rel-1',
      fromId: 'e1',
      toId: 'e2',
      type: 'influencia',
      description: null,
      origin: { kind: 'manual' },
      createdAt: '2026-06-17T10:00:00.000Z',
      updatedAt: '2026-06-17T10:00:00.000Z',
    },
  ],
  nextCursor: null,
}

beforeEach(() => {
  graphFitToView.mockClear()
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

  it('no oculta dependencias de hooks con suppressions de exhaustive-deps', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/GraphView.tsx'),
      'utf8',
    )

    expect(source).not.toContain('eslint-disable-next-line react-hooks/exhaustive-deps')
  })

  it('solo considera encuadrado el grafo cuando el canvas tiene dimensiones reales', () => {
    expect(
      graphViewportFitKey({
        mode: 'by-degree',
        svgSize: { width: 0, height: 0 },
        entityCount: graphEntities.length,
        relationshipCount: graphRelationships.items.length,
      }),
    ).toBeNull()
    expect(
      graphViewportFitKey({
        mode: 'by-degree',
        svgSize: { width: 1440, height: 820 },
        entityCount: graphEntities.length,
        relationshipCount: graphRelationships.items.length,
      }),
    ).toBe('by-degree:2:1:1440x820')
    expect(
      graphViewportFitKey({
        mode: 'organic',
        svgSize: { width: 1440, height: 820 },
        entityCount: graphEntities.length,
        relationshipCount: graphRelationships.items.length,
      }),
    ).toBeNull()
  })
})
