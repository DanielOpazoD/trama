import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { CalendarHeatmap } from './CalendarHeatmap'
import type { Entity, Quote, Relationship } from '../types'

/**
 * Smoke tests para CalendarHeatmap. Componente puro (recibe props,
 * sin queries), así que no necesita providers.
 */

const today = new Date().toISOString()

function makeEntity(id: string): Entity {
  return {
    id,
    type: 'persona',
    name: `entity-${id}`,
    origin: { kind: 'manual' },
    createdAt: today,
    updatedAt: today,
  }
}

function makeQuote(id: string): Quote {
  return {
    id,
    entityId: 'e-1',
    text: `quote ${id}`,
    linkedQuoteIds: [],
    origin: { kind: 'manual' },
    createdAt: today,
    updatedAt: today,
  }
}

function makeRel(id: string): Relationship {
  return {
    id,
    fromId: 'e-1',
    toId: 'e-2',
    type: 'influencia',
    origin: { kind: 'manual' },
    createdAt: today,
    updatedAt: today,
  }
}

describe('<CalendarHeatmap />', () => {
  it('returns null when there is no activity in the window', () => {
    const { container } = render(
      <CalendarHeatmap entities={[]} quotes={[]} relationships={[]} />,
    )
    // Nada renderizado cuando no hay nada que mostrar
    expect(container.firstChild).toBeNull()
  })

  it('renders the grid when activity exists', () => {
    const { container } = render(
      <CalendarHeatmap
        entities={[makeEntity('e-1')]}
        quotes={[makeQuote('q-1')]}
        relationships={[makeRel('r-1')]}
      />,
    )
    // Hay al menos una celda renderizada (los buckets están como divs)
    expect(container.querySelectorAll('div').length).toBeGreaterThan(0)
  })

  it('makes cells clickable when onSelectDay is provided', () => {
    const onSelectDay = vi.fn()
    const { container } = render(
      <CalendarHeatmap
        entities={[makeEntity('e-1')]}
        quotes={[]}
        relationships={[]}
        onSelectDay={onSelectDay}
      />,
    )
    // Cuando hay onSelectDay, las celdas son buttons. Encontramos al menos uno
    // con la celda de hoy (el más reciente).
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBeGreaterThan(0)
    // Click en uno dispara el callback
    if (buttons[0]) {
      fireEvent.click(buttons[0])
      // No verificamos el ISO exacto porque depende del bucket, solo que se llamó
      expect(onSelectDay).toHaveBeenCalled()
    }
  })

  it('renders no buttons when onSelectDay is omitted (cells are not interactive)', () => {
    const { container } = render(
      <CalendarHeatmap
        entities={[makeEntity('e-1')]}
        quotes={[]}
        relationships={[]}
      />,
    )
    expect(container.querySelectorAll('button').length).toBe(0)
  })
})
