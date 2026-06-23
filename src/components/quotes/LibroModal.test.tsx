import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { LibroModal } from './LibroModal'
import { makeQueryClient, renderWithProviders } from '../../test-utils'
import { queryKeys } from '../../state/queryClient'
import type { Entity, Quote } from '../../types'

/**
 * Smoke del modal del libro. La composición real del libro se testea en
 * src/lib/libro/buildLibro.test.ts (ejecución completa con pdf-lib); acá va
 * el chrome: que abra, muestre sus controles y cierre. La Lámina, su modal
 * hermano, tiene su propio smoke en LaminaModal.test.tsx.
 */

function jsonResp(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function entity(id: string, name: string): Entity {
  return {
    id,
    type: 'escritor',
    name,
    origin: { kind: 'manual' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

function quote(
  id: string,
  entityId: string,
  text: string,
  opts: { source?: string; createdAt?: string; pinnedAt?: string } = {},
): Quote {
  return {
    id,
    entityId,
    text,
    ...(opts.source ? { source: opts.source } : {}),
    ...(opts.pinnedAt ? { pinnedAt: opts.pinnedAt } : {}),
    linkedQuoteIds: [],
    origin: { kind: 'manual' },
    createdAt: opts.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

beforeEach(() => {
  window.localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => jsonResp([])),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('<LibroModal />', () => {
  it('muestra título editable, autor y el resumen de la edición', () => {
    renderWithProviders(<LibroModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Mi libro' })
    // Migrado a useModalOverlay: el diálogo es aria-modal.
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.textContent).toMatch(/florilegio como edición/i)
    expect(screen.getByDisplayValue('Florilegio')).toBeInTheDocument()
    // Sin citas, componer queda deshabilitado.
    expect(screen.getByRole('button', { name: /componer pdf/i })).toBeDisabled()
  })

  it('cierra con Escape', () => {
    const onClose = vi.fn()
    renderWithProviders(<LibroModal onClose={onClose} />)
    // useModalOverlay escucha keydown en document (capture).
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('muestra una ficha de imprenta con conteos, fecha y estado de exportación', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-10T12:00:00'))
    const queryClient = makeQueryClient()
    queryClient.setQueryData(queryKeys.entities, [
      entity('a', 'Borges'),
      entity('b', 'Pizarnik'),
    ])
    queryClient.setQueryData(queryKeys.quotes, [
      quote('q1', 'a', 'El paraíso será una biblioteca.', {
        source: 'El libro de arena',
        createdAt: '2024-05-01T12:00:00.000Z',
      }),
      quote('q2', 'b', 'Explicar con palabras de este mundo.', {
        source: 'Árbol de Diana',
        createdAt: '2026-02-01T12:00:00.000Z',
        pinnedAt: '2026-03-01T12:00:00.000Z',
      }),
    ])
    renderWithProviders(<LibroModal onClose={() => {}} />, { queryClient })

    const ficha = screen.getByLabelText('Ficha de imprenta')
    expect(ficha).toHaveTextContent(/2 citas/i)
    expect(ficha).toHaveTextContent(/2 voces/i)
    expect(ficha).toHaveTextContent(/2 fuentes/i)
    expect(ficha).toHaveTextContent(/1 favorita/i)
    expect(ficha).toHaveTextContent(/2024-2026/i)
    expect(ficha).toHaveTextContent(/10 de junio de 2026/i)
    expect(ficha).toHaveTextContent(/lista para imprenta/i)
    expect(screen.getByRole('button', { name: /previsualizar pdf/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /componer pdf/i })).toBeEnabled()
  })
})
