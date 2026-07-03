import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PdfStudioShortcutsHelp } from './PdfStudioShortcutsHelp'

describe('PdfStudioShortcutsHelp', () => {
  it('el botón «?» abre la hoja con los atajos del modo diseño', () => {
    render(<PdfStudioShortcutsHelp mode="design" />)
    fireEvent.click(screen.getByRole('button', { name: /Atajos de teclado/ }))
    expect(screen.getByRole('dialog', { name: 'Atajos de teclado' })).toBeInTheDocument()
    expect(screen.getByText('Crear un casillero de texto donde haces clic')).toBeVisible()
    expect(screen.getByText('Mover sin imán de alineación')).toBeVisible()
  })

  it('⌘/ alterna la hoja y el modo relleno muestra Enter', () => {
    render(<PdfStudioShortcutsHelp mode="fill" />)
    fireEvent.keyDown(document, { key: '/', metaKey: true })
    expect(
      screen.getByText('Saltar al siguiente campo (la página te sigue)'),
    ).toBeVisible()
    fireEvent.keyDown(document, { key: '/', metaKey: true })
    expect(screen.queryByRole('dialog', { name: 'Atajos de teclado' })).toBeNull()
  })
})
