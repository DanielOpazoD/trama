import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { MonthNotes } from './MonthNotes'
import { renderWithProviders } from '../../test-utils'

beforeEach(() => {
  // El endpoint devuelve contenido según la categoría pedida.
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const u = String(url)
      const category = u.includes('category=personal') ? 'personal' : 'trabajo'
      const content = category === 'personal' ? 'nota personal' : 'nota trabajo'
      return new Response(JSON.stringify({ monthKey: '2026-06', content, category }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('<MonthNotes />', () => {
  it('muestra las pestañas Trabajo/Personal y carga el contenido por categoría', async () => {
    renderWithProviders(<MonthNotes monthKey="2026-06" label="junio 2026" />)
    expect(screen.getByRole('tab', { name: 'Trabajo' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Personal' })).toBeInTheDocument()

    // Carga inicial: la pestaña Trabajo.
    expect(await screen.findByDisplayValue('nota trabajo')).toBeInTheDocument()

    // Cambiar a Personal → recarga el campo con el contenido de esa categoría.
    fireEvent.click(screen.getByRole('tab', { name: 'Personal' }))
    expect(await screen.findByDisplayValue('nota personal')).toBeInTheDocument()
  })

  it('muestra ErrorState (no el textarea vacío) cuando falla la carga inicial', async () => {
    // El fetch se rompe: NO debe colapsar en un textarea vacío (que parecería
    // "sin notas todavía") sino nombrar el error y ofrecer reintentar.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'boom' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    )

    renderWithProviders(<MonthNotes monthKey="2026-06" label="junio 2026" />)

    // Aparece el estado de error (ErrorState usa role="alert").
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudieron cargar las notas')
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()

    // Y NO se monta el editor vacío que confundiría "roto" con "vacío".
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
