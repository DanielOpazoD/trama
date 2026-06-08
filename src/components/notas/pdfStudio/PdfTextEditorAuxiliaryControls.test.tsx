import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { STAMP_ACCEPT } from './pdfImageStamp'
import { PdfTextEditorAuxiliaryControls } from './PdfTextEditorAuxiliaryControls'

function renderControls({
  fillMode = false,
  pendingFormKind = false,
  onCancelPendingFormField = vi.fn(),
}: {
  fillMode?: boolean
  pendingFormKind?: boolean
  onCancelPendingFormField?: () => void
} = {}) {
  render(
    <PdfTextEditorAuxiliaryControls
      fillMode={fillMode}
      formSuggestionStatus={null}
      pendingFormKind={pendingFormKind}
      signatureInputRef={createRef<HTMLInputElement>()}
      stampAccept={STAMP_ACCEPT}
      stampInputRef={createRef<HTMLInputElement>()}
      onCancelPendingFormField={onCancelPendingFormField}
      onSignatureFile={vi.fn()}
      onStampFile={vi.fn()}
    />,
  )
}

describe('<PdfTextEditorAuxiliaryControls />', () => {
  it('muestra el estado guiado para colocar un casillero y permite cancelarlo', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()

    renderControls({ pendingFormKind: true, onCancelPendingFormField: onCancel })

    expect(screen.getByRole('status')).toHaveTextContent('Colocar casillero')

    await user.click(screen.getByRole('button', { name: /Cancelar creación/i }))

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('no muestra herramientas auxiliares de creación en modo relleno', () => {
    renderControls({ fillMode: true, pendingFormKind: true })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Cancelar creación/i }),
    ).not.toBeInTheDocument()
  })
})
