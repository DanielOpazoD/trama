import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '../../api'
import { TaskItem } from './TaskItem'

const baseTask: Task = {
  id: 't1',
  title: 'Ordenar #archivo',
  detail: 'revisar #caja_1\nantes de guardar',
  done: false,
  dueDate: '2026-05-30',
  priority: 'media',
  weekStart: '2026-05-25',
  completedAt: null,
  tags: ['archivo', 'caja_1'],
  createdAt: '2026-05-29T10:00:00.000Z',
  updatedAt: '2026-05-29T10:00:00.000Z',
}

describe('<TaskItem />', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-31T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('muestra estado, tags y vencimiento sin disparar acciones de edición', () => {
    const onToggle = vi.fn()
    render(
      <TaskItem
        task={baseTask}
        onToggle={onToggle}
        onSave={vi.fn()}
        onDelete={vi.fn()}
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

  it('edita título, detalle y vencimiento normalizando espacios vacíos', () => {
    const onSave = vi.fn()
    render(
      <TaskItem task={baseTask} onToggle={vi.fn()} onSave={onSave} onDelete={vi.fn()} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /editar tarea/i }))
    fireEvent.change(screen.getByPlaceholderText(/título de la tarea/i), {
      target: { value: '  nueva tarea  ' },
    })
    fireEvent.change(screen.getByPlaceholderText(/detalle/i), {
      target: { value: '   ' },
    })
    fireEvent.change(screen.getByLabelText(/vence/i), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    expect(onSave).toHaveBeenCalledWith({
      title: 'nueva tarea',
      detail: null,
      dueDate: null,
      priority: 'media',
    })
    expect(screen.queryByPlaceholderText(/título de la tarea/i)).not.toBeInTheDocument()
  })

  it('cicla la prioridad desde la línea sin entrar a edición', () => {
    const onSave = vi.fn()
    render(
      <TaskItem task={baseTask} onToggle={vi.fn()} onSave={onSave} onDelete={vi.fn()} />,
    )

    // baseTask es 'media'; un clic en el punto cicla a 'baja'.
    fireEvent.click(screen.getByRole('button', { name: /prioridad media, cambiar/i }))
    expect(onSave).toHaveBeenCalledWith({ priority: 'baja' })
  })

  it('permite cancelar edición y confirma antes de borrar', () => {
    const onDelete = vi.fn()
    render(
      <TaskItem
        task={{ ...baseTask, done: true, dueDate: null }}
        onToggle={vi.fn()}
        onSave={vi.fn()}
        onDelete={onDelete}
      />,
    )

    expect(
      screen.getByRole('checkbox', { name: /marcar como pendiente/i }),
    ).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(screen.getByRole('button', { name: /editar tarea/i }))
    fireEvent.change(screen.getByPlaceholderText(/título de la tarea/i), {
      target: { value: 'no guardar' },
    })
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.queryByDisplayValue('no guardar')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /borrar tarea/i }))
    expect(onDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^borrar$/i }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
