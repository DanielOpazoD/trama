import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ActivityCalendar } from './ActivityCalendar'
import type { Note } from '../../api'

function noteAt(id: string, iso: string, tags: string[]): Note {
  return {
    id,
    content: `nota ${id}`,
    tags,
    pinned: false,
    promotedMomentoId: null,
    createdAt: iso,
    updatedAt: iso,
  }
}

describe('<ActivityCalendar />', () => {
  it('muestra estadísticas y deja seleccionar un día con actividad', () => {
    // Dos notas de "hoy" para que caigan en el mes visible por defecto.
    const now = new Date().toISOString()
    const notes = [noteAt('a', now, ['x']), noteAt('b', now, ['y'])]
    const onSelectDay = vi.fn()

    render(
      <ActivityCalendar notes={notes} selectedDay={null} onSelectDay={onSelectDay} />,
    )

    // Estadísticas: 2 etiquetas únicas.
    expect(screen.getByText('etiquetas')).toBeInTheDocument()

    // La celda de hoy tiene 2 notas; al hacer clic se selecciona ese día.
    const cell = screen.getByRole('button', { name: /: 2 notas$/ })
    fireEvent.click(cell)
    expect(onSelectDay).toHaveBeenCalledTimes(1)
    expect(onSelectDay.mock.calls[0]![0]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
