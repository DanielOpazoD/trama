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

  it('Escape cancela la colocación pendiente sin llegar al resto del editor', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const escapeLeaked = vi.fn()
    document.addEventListener('keydown', escapeLeaked)

    renderControls({ pendingFormKind: true, onCancelPendingFormField: onCancel })
    await user.keyboard('{Escape}')

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(escapeLeaked).not.toHaveBeenCalled()
    document.removeEventListener('keydown', escapeLeaked)
  })

  it('Escape no hace nada si no hay colocación pendiente', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()

    renderControls({ pendingFormKind: false, onCancelPendingFormField: onCancel })
    await user.keyboard('{Escape}')

    expect(onCancel).not.toHaveBeenCalled()
  })
})
