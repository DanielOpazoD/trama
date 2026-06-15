import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { FocusedWriting } from './FocusedWriting'

/** Caller controlado: el overlay edita el MISMO borrador en vivo. */
function Harness({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState('borrador')
  return (
    <FocusedWriting
      value={value}
      onChange={setValue}
      onClose={onClose}
      bodyPlaceholder="Escribe…"
    />
  )
}

describe('<FocusedWriting />', () => {
  it('se abre como diálogo con la etiqueta accesible', () => {
    render(<Harness onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Escritura enfocada' })).toBeInTheDocument()
  })

  it('los cambios del cuerpo propagan al estado del caller', async () => {
    const user = userEvent.setup()
    render(<Harness onClose={() => {}} />)
    const ta = screen.getByLabelText('Contenido de la nota') as HTMLTextAreaElement
    expect(ta.value).toBe('borrador')

    await user.type(ta, ' nuevo')
    expect(ta.value).toBe('borrador nuevo')
  })

  it('Escape cierra (y llama onSave si se pasa)', () => {
    const onClose = vi.fn()
    const onSave = vi.fn()
    render(
      <FocusedWriting value="x" onChange={() => {}} onClose={onClose} onSave={onSave} />,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onSave).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('restaura el foco al disparador al cerrar', async () => {
    function Host() {
      const [open, setOpen] = useState(false)
      const [value, setValue] = useState('x')
      return (
        <>
          <button onClick={() => setOpen(true)}>abrir</button>
          {open && (
            <FocusedWriting
              value={value}
              onChange={setValue}
              onClose={() => setOpen(false)}
            />
          )}
        </>
      )
    }
    const user = userEvent.setup()
    render(<Host />)
    const opener = screen.getByRole('button', { name: 'abrir' })
    opener.focus()
    await user.click(opener)

    expect(screen.getByRole('dialog', { name: 'Escritura enfocada' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Escritura enfocada' })).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
