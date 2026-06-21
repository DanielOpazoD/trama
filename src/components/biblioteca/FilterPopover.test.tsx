import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { FilterPopover } from './FilterPopover'
import type { LibraryFileType, LibrarySource } from '../../types/biblioteca'

/**
 * El FilterPopover es presentacional (recibe valores + callbacks). Para probar
 * la selección/limpieza lo envolvemos en un host con estado, de modo que la
 * opción activa (el check + el highlight) refleje el cambio tras el click.
 */
function Host({
  initialTipo = '',
  initialFuente = '',
  onChange,
}: {
  initialTipo?: LibraryFileType | ''
  initialFuente?: LibrarySource | ''
  onChange?: (next: { tipo: LibraryFileType | ''; fuente: LibrarySource | '' }) => void
}) {
  const [tipo, setTipo] = useState<LibraryFileType | ''>(initialTipo)
  const [fuente, setFuente] = useState<LibrarySource | ''>(initialFuente)
  return (
    <FilterPopover
      tipo={tipo}
      fuente={fuente}
      onChangeTipo={(next) => {
        setTipo(next)
        onChange?.({ tipo: next, fuente })
      }}
      onChangeFuente={(next) => {
        setFuente(next)
        onChange?.({ tipo, fuente: next })
      }}
    />
  )
}

function openPopover() {
  fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
}

describe('<FilterPopover />', () => {
  it('abre el panel con las secciones Fuente y Tipo', () => {
    render(<Host />)
    // Cerrado al inicio: no hay opciones.
    expect(screen.queryByRole('menuitemradio', { name: /Subidos/ })).toBeNull()

    openPopover()
    expect(screen.getByRole('menuitemradio', { name: 'Subidos' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Imágenes' })).toBeInTheDocument()
    // El trigger expone aria-expanded.
    expect(screen.getByRole('button', { name: 'Filtros' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('seleccionar una Fuente la marca y emite el valor + sube el badge', () => {
    const onChange = vi.fn()
    render(<Host onChange={onChange} />)
    openPopover()

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Generados' }))

    expect(onChange).toHaveBeenCalledWith({ tipo: '', fuente: 'generado' })
    // Queda marcada (aria-checked) y el badge del trigger muestra "1".
    expect(screen.getByRole('menuitemradio', { name: 'Generados' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Filtros' })).toHaveTextContent('1')
  })

  it('seleccionar un Tipo emite el valor', () => {
    const onChange = vi.fn()
    render(<Host onChange={onChange} />)
    openPopover()

    fireEvent.click(screen.getByRole('menuitemradio', { name: 'PDF' }))

    expect(onChange).toHaveBeenCalledWith({ tipo: 'pdf', fuente: '' })
  })

  it('cuenta dos filtros activos en el badge (tipo + fuente)', () => {
    render(<Host initialTipo="pdf" initialFuente="subido" />)
    expect(screen.getByRole('button', { name: 'Filtros' })).toHaveTextContent('2')
  })

  it('volver a clickear la opción activa la limpia (clearable)', () => {
    const onChange = vi.fn()
    render(<Host initialFuente="capturado" onChange={onChange} />)
    openPopover()

    // Arranca marcada; al clickearla otra vez emite '' (sin filtro).
    expect(screen.getByRole('menuitemradio', { name: 'Capturados' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Capturados' }))
    expect(onChange).toHaveBeenCalledWith({ tipo: '', fuente: '' })
  })

  it('sin filtros activos el trigger no muestra badge', () => {
    render(<Host />)
    // El único texto del botón sería el badge; vacío = sin badge.
    expect(screen.getByRole('button', { name: 'Filtros' })).toHaveTextContent('')
  })
})
