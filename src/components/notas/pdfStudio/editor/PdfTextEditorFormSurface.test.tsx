import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { makePdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import { PdfTextEditorFormSurface } from './PdfTextEditorFormSurface'

const field = makePdfFormFieldDraft({
  fieldKind: 'text',
  pageId: 'p1',
  name: 'campo_1',
  value: '',
  xRatio: 0.1,
  yRatio: 0.2,
  wRatio: 0.3,
  hRatio: 0.05,
})

describe('<PdfTextEditorFormSurface />', () => {
  it('no renderiza el inspector dentro de la capa escalada de la hoja', () => {
    render(
      <PdfTextEditorFormSurface
        detectedWidgets={[]}
        draftFields={[field]}
        selectedDraftId={field.id}
        selectedDraftIds={[field.id]}
        pageHeightPx={500}
        zoom={1}
        onDetectedValueChange={vi.fn()}
        onDraftValueChange={vi.fn()}
        onOpenSignature={vi.fn()}
        onSelectDraft={vi.fn()}
        onStartDraftDrag={vi.fn()}
        onStartDraftResize={vi.fn()}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'campo_1' })).toBeInTheDocument()
    expect(screen.queryByText('Casillero')).toBeNull()
  })
})
