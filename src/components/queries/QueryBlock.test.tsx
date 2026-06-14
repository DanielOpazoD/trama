import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { renderMarkdown } from '../notas/markdown'
import { QueryBlock } from './QueryBlock'

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            kind: 'entity',
            id: 'e1',
            title: 'Borges',
            snippet: 'escritor',
            createdAt: '2024-01-01',
            tags: [],
          },
        ],
        nextCursor: null,
      }),
    ),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('<QueryBlock />', () => {
  it('AST válido → ejecuta y muestra los resultados', async () => {
    renderWithProviders(
      <QueryBlock source='{"from":["entity"],"where":{"op":"matches","value":"borges"}}' />,
    )
    expect(await screen.findByText('Borges')).toBeInTheDocument()
    expect(screen.getByText('Consulta embebida')).toBeInTheDocument()
  })

  it('JSON inválido → aviso, sin romper la nota', () => {
    renderWithProviders(<QueryBlock source="no soy json" />)
    expect(screen.getByText(/No se pudo leer el bloque/)).toBeInTheDocument()
  })

  it('sin "from" → aviso', () => {
    renderWithProviders(<QueryBlock source='{"where":{"op":"matches","value":"x"}}' />)
    expect(screen.getByText(/falta "from"/)).toBeInTheDocument()
  })
})

describe('renderMarkdown + valla ```trama-query', () => {
  it('renderiza el bloque embebible en vivo (no un <pre>)', async () => {
    const src =
      'antes\n```trama-query\n{"from":["entity"],"where":{"op":"matches","value":"borges"}}\n```\ndespués'
    const { container } = renderWithProviders(<div>{renderMarkdown(src)}</div>)
    expect(await screen.findByText('Borges')).toBeInTheDocument()
    expect(screen.getByText('Consulta embebida')).toBeInTheDocument()
    // El bloque trama-query NO se renderiza como código plano.
    expect(container.querySelector('pre')).toBeNull()
  })

  it('una valla normal ``` sigue siendo <pre>', () => {
    const { container } = renderWithProviders(
      <div>{renderMarkdown('```\nplain code\n```')}</div>,
    )
    expect(container.querySelector('pre')).toBeTruthy()
  })
})
