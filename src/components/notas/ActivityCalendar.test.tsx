import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ActivityCalendar } from './ActivityCalendar'

function todayKey(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

describe('<ActivityCalendar />', () => {
  it('muestra estadísticas y deja seleccionar un día con actividad', () => {
    const key = todayKey()
    const onSelectDay = vi.fn()

    render(
      <ActivityCalendar
        dayKeys={[key, key]}
        stats={[{ n: 2, label: 'etiquetas' }]}
        selectedDay={null}
        onSelectDay={onSelectDay}
      />,
    )

    // La estadística provista por el caller se muestra.
    expect(screen.getByText('etiquetas')).toBeInTheDocument()

    // La celda de hoy tiene 2 notas; al hacer clic se selecciona ese día.
    const cell = screen.getByRole('button', { name: /: 2 notas$/ })
    fireEvent.click(cell)
    expect(onSelectDay).toHaveBeenCalledWith(key)
  })
})
