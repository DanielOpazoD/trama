import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makePdfFormFieldDraft } from '../../../../../lib/pdfStudio/model/model'
import { usePdfTextEditorFillFocus } from './usePdfTextEditorFillFocus'

const field = makePdfFormFieldDraft({
  fieldKind: 'text',
  pageId: 'p2',
  name: 'paciente',
  value: 'Camila',
  xRatio: 0.2,
  yRatio: 0.3,
  wRatio: 0.3,
  hRatio: 0.05,
})

function Harness({ goToPage = vi.fn() }: { goToPage?: (pageIndex: number) => void }) {
  const { activeFillFieldId, jumpToFormField } = usePdfTextEditorFillFocus({
    goToPage,
    pageIndexById: { p2: 1 },
  })
  return (
    <>
      <button type="button" onClick={() => jumpToFormField(field)}>
        Saltar
      </button>
      <input data-form-field-control={field.id} defaultValue="Camila" />
      <span>{activeFillFieldId}</span>
    </>
  )
}

describe('usePdfTextEditorFillFocus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('centra, enfoca y selecciona el casillero al saltar desde el panel', () => {
    const goToPage = vi.fn()
    render(<Harness goToPage={goToPage} />)
    const input = screen.getByDisplayValue('Camila') as HTMLInputElement
    input.scrollIntoView = vi.fn()

    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))

    expect(goToPage).toHaveBeenCalledWith(1)
    expect(screen.getByText(field.id)).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(80))

    expect(input.scrollIntoView).toHaveBeenCalledWith({
      block: 'center',
      inline: 'center',
      behavior: 'auto',
    })
    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('Camila'.length)
  })
})
