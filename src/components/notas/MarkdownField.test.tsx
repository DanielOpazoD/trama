import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import { MarkdownField } from './MarkdownField'

/** Wrapper controlado: refleja value/onChange como lo hace un caller real. */
function Harness({ initial = 'hola mundo' }: { initial?: string }) {
  const [value, setValue] = useState(initial)
  return <MarkdownField value={value} onChange={setValue} aria-label="Cuerpo" rows={4} />
}

/** Selecciona un rango en el textarea y dispara `select` (como hace el browser). */
function selectRange(ta: HTMLTextAreaElement, start: number, end: number) {
  ta.focus()
  ta.setSelectionRange(start, end)
  fireEvent.select(ta)
}

describe('<MarkdownField />', () => {
  it('revela la barra de formato solo cuando hay selección', () => {
    render(<Harness />)
    const ta = screen.getByLabelText('Cuerpo') as HTMLTextAreaElement

    expect(screen.queryByRole('toolbar', { name: 'Formato de texto' })).toBeNull()

    selectRange(ta, 0, 4)
    expect(screen.getByRole('toolbar', { name: 'Formato de texto' })).toBeInTheDocument()
  })

  it('Negrita envuelve la selección en **…**', () => {
    render(<Harness />)
    const ta = screen.getByLabelText('Cuerpo') as HTMLTextAreaElement

    selectRange(ta, 0, 4) // "hola"
    fireEvent.click(screen.getByRole('button', { name: 'Negrita' }))

    expect(ta.value).toBe('**hola** mundo')
  })

  it('Cita prefija la línea seleccionada con "> "', () => {
    render(<Harness initial="una linea" />)
    const ta = screen.getByLabelText('Cuerpo') as HTMLTextAreaElement

    selectRange(ta, 0, 9)
    fireEvent.click(screen.getByRole('button', { name: 'Cita' }))

    expect(ta.value).toBe('> una linea')
  })

  it('⌘B aplica negrita desde el teclado', () => {
    render(<Harness />)
    const ta = screen.getByLabelText('Cuerpo') as HTMLTextAreaElement

    selectRange(ta, 5, 10) // "mundo"
    fireEvent.keyDown(ta, { key: 'b', metaKey: true })

    expect(ta.value).toBe('hola **mundo**')
  })

  it('muestra el disparador de escritura enfocada solo si se pasa el handler', () => {
    const onRequest = vi.fn()
    const { rerender } = render(
      <MarkdownField value="x" onChange={() => {}} aria-label="Cuerpo" />,
    )
    expect(screen.queryByRole('button', { name: 'Abrir escritura enfocada' })).toBeNull()

    rerender(
      <MarkdownField
        value="x"
        onChange={() => {}}
        aria-label="Cuerpo"
        onRequestFocusMode={onRequest}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Abrir escritura enfocada' }))
    expect(onRequest).toHaveBeenCalledOnce()
  })
})
