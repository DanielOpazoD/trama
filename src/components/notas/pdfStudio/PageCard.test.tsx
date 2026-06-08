import { cleanup, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { addPdfSource, emptyDoc } from '../../../lib/pdfStudio/model/model'
import { PageCard } from './PageCard'

vi.mock('../../../lib/pdfStudio/render/pdfRender', () => ({
  renderPageThumb: vi.fn(async () => 'blob:thumb'),
}))

const pdf = () => new File(['%PDF'], 'base.pdf', { type: 'application/pdf' })

function renderCard(interactionMode: 'editor' | 'templateDesign' | 'templateFill') {
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
      onToggleSelect={vi.fn()}
    />,
  )
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
})
