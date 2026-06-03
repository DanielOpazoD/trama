import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../api'
import { renderWithProviders } from '../../test-utils'
import { TaskItem } from './TaskItem'

const baseTask: Task = {
  id: 't1',
  title: 'Ordenar #archivo',
  detail: 'revisar #caja_1\nantes de guardar',
  done: false,
  dueDate: '2026-05-30',
  priority: 'media',
  weekStart: '2026-05-25',
  category: 'trabajo',
  completedAt: null,
  tags: ['archivo', 'caja_1'],
  createdAt: '2026-05-29T10:00:00.000Z',
  updatedAt: '2026-05-29T10:00:00.000Z',
}

const noop = () => {}

describe('<TaskItem />', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-31T12:00:00.000Z'))
    // El editor monta la tira de fotos (React Query); devolvemos [] a cualquier fetch.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('muestra estado, tags y vencimiento', () => {
    const onToggle = vi.fn()
    renderWithProviders(
      <TaskItem
        task={baseTask}
        displayWeek="2026-05-25"
        onToggle={onToggle}
        onSave={noop}
        onDelete={noop}
      />,
    )

    expect(screen.getByText('#archivo')).toBeInTheDocument()
    expect(screen.getByText('#caja_1')).toBeInTheDocument()
    expect(screen.getByText(/venció 30 may/i)).toBeInTheDocument()

    const checkbox = screen.getByRole('checkbox', { name: /marcar como hecha/i })
    expect(checkbox).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(checkbox)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('edita desde el menú ⋯ normalizando espacios vacíos', () => {
    const onSave = vi.fn()
    renderWithProviders(
      <TaskItem
        task={baseTask}
        displayWeek="2026-05-25"
        onToggle={noop}
        onSave={onSave}
        onDelete={noop}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /acciones del recordatorio/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /editar/i }))

    fireEvent.change(screen.getByPlaceholderText(/título de la tarea/i), {
      target: { value: '  nueva tarea  ' },
    })
    fireEvent.change(screen.getByPlaceholderText(/detalle/i), {
      target: { value: '   ' },
    })
    fireEvent.change(screen.getByLabelText(/vence/i), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    expect(onSave).toHaveBeenCalledWith({
      title: 'nueva tarea',
      detail: null,
      dueDate: null,
      priority: 'media',
      weekStart: '2026-05-25',
    })
    expect(screen.queryByPlaceholderText(/título de la tarea/i)).not.toBeInTheDocument()
  })

  it('cambia la prioridad desde el menú de la línea', () => {
    const onSave = vi.fn()
    renderWithProviders(
      <TaskItem
        task={baseTask}
        displayWeek="2026-05-25"
        onToggle={noop}
        onSave={onSave}
        onDelete={noop}
      />,
    )

    // El punto de color abre un menú; se elige el color directamente.
    fireEvent.click(screen.getByRole('button', { name: /prioridad media . cambiar/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /alta/i }))
    expect(onSave).toHaveBeenCalledWith({ priority: 'alta' })
  })

  it('borra desde el menú ⋯', () => {
    const onDelete = vi.fn()
    renderWithProviders(
      <TaskItem
        task={baseTask}
        displayWeek="2026-05-25"
        onToggle={noop}
        onSave={noop}
        onDelete={onDelete}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /acciones del recordatorio/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /borrar/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('marca "desde" cuando el pendiente viene de una semana anterior', () => {
    renderWithProviders(
      <TaskItem
        task={{ ...baseTask, weekStart: '2026-05-18' }}
        displayWeek="2026-05-25"
        onToggle={noop}
        onSave={noop}
        onDelete={noop}
      />,
    )
    expect(screen.getByText(/desde 18 may/i)).toBeInTheDocument()
  })
})
