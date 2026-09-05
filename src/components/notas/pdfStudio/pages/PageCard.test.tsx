import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { addPdfSource, emptyDoc } from '../../../../lib/pdfStudio/model/model'
import { PageCard } from './PageCard'

vi.mock('../../../../lib/pdfStudio/render/pdfRender', () => ({
  renderPageThumb: vi.fn(async () => 'blob:thumb'),
}))

const pdf = () => new File(['%PDF'], 'base.pdf', { type: 'application/pdf' })

function renderCard(
  interactionMode: 'editor' | 'templateDesign' | 'templateFill',
  onToggleSelect = vi.fn(),
) {
  const doc = addPdfSource(emptyDoc(), pdf(), 1)
  render(
    <PageCard
      doc={doc}
      interactionMode={interactionMode}
      page={doc.pages[0]!}
      index={0}
      total={1}
      selected={false}
      dragging={false}
      isDropTarget={false}
      scrollRoot={null}
      onDragEnd={vi.fn()}
      onDragEnterCard={vi.fn()}
      onDragStart={vi.fn()}
      onDropOn={vi.fn()}
      onNudge={vi.fn()}
      onOpenText={vi.fn()}
      onToggleSelect={onToggleSelect}
    />,
  )
  return onToggleSelect
}

describe('<PageCard />', () => {
  it('adapta el texto de doble clic al modo de trabajo', () => {
    renderCard('editor')
    expect(screen.getByTitle('Doble clic para ver y editar')).toBeInTheDocument()

    cleanup()
    renderCard('templateDesign')
    expect(screen.getByTitle('Doble clic para crear plantilla')).toBeInTheDocument()

    cleanup()
    renderCard('templateFill')
    expect(screen.getByTitle('Doble clic para rellenar planilla')).toBeInTheDocument()
  })

  it('⌘/Ctrl+clic en la hoja alterna, Shift+clic extiende el rango, el clic simple no marca', () => {
    const onToggleSelect = renderCard('editor')
    const card = screen.getByRole('listitem')

    fireEvent.click(card)
    expect(onToggleSelect).not.toHaveBeenCalled()

    fireEvent.click(card, { metaKey: true })
    expect(onToggleSelect).toHaveBeenLastCalledWith(false)

    fireEvent.click(card, { ctrlKey: true })
    expect(onToggleSelect).toHaveBeenLastCalledWith(false)

    fireEvent.click(card, { shiftKey: true })
    expect(onToggleSelect).toHaveBeenLastCalledWith(true)
    expect(onToggleSelect).toHaveBeenCalledTimes(3)
  })

  it('con la hoja enfocada, Espacio marca y Shift+Espacio extiende el rango', () => {
    const onToggleSelect = renderCard('editor')
    const card = screen.getByRole('listitem')

    fireEvent.keyDown(card, { key: ' ' })
    expect(onToggleSelect).toHaveBeenLastCalledWith(false)

    fireEvent.keyDown(card, { key: ' ', shiftKey: true })
    expect(onToggleSelect).toHaveBeenLastCalledWith(true)
  })

  it('el tick sigue siendo suyo: un clic ahí no marca dos veces', () => {
    const onToggleSelect = renderCard('editor')
    fireEvent.click(screen.getByRole('button', { name: /marcar la hoja 1/i }), {
      metaKey: true,
    })
    expect(onToggleSelect).toHaveBeenCalledTimes(1)
  })
})
