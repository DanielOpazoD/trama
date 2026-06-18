import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NotasFeedComposer } from './NotasFeedComposer'

describe('<NotasFeedComposer />', () => {
  function renderComposer(
    overrides: Partial<Parameters<typeof NotasFeedComposer>[0]> = {},
  ) {
    return render(
      <NotasFeedComposer
        accent="var(--accent-sage)"
        title=""
        draft="nota"
        pendingFiles={[]}
        allNoteTags={['ideas']}
        textareaRef={createRef<HTMLTextAreaElement>()}
        dragging={false}
        composerFocused={false}
        composerActive
        isLinkDraft={false}
        justSaved={false}
        createNoteBusy={false}
        uploadAttachmentBusy={false}
        createRecorteBusy={false}
        onTitleChange={vi.fn()}
        onDraftChange={vi.fn()}
        onPendingFilesChange={vi.fn()}
        onComposerFocus={() => undefined}
        onComposerBlur={() => undefined}
        onComposerDragOver={vi.fn()}
        onComposerDragLeave={vi.fn()}
        onComposerDrop={vi.fn()}
        onComposerPaste={vi.fn()}
        onComposerKeyDown={vi.fn()}
        onCaptureMediaInput={vi.fn()}
        onRequestFocusMode={vi.fn()}
        onForceNote={vi.fn()}
        onSave={vi.fn()}
        {...overrides}
      />,
    )
  }

  it('expone el flujo de enlace detectado y permite volver a guardar como nota', async () => {
    const user = userEvent.setup()
    const onForceNote = vi.fn()
    const onSave = vi.fn()

    renderComposer({
      draft: 'https://ejemplo.com/articulo',
      isLinkDraft: true,
      onForceNote,
      onSave,
    })

    expect(screen.getByText(/se guardará como recorte/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'guardar como nota' }))
    expect(onForceNote).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Guardar enlace' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('bloquea la captura de media mientras se guarda un recorte', () => {
    renderComposer({ createRecorteBusy: true })

    expect(screen.getByLabelText('Elegir imagen o video para capturar')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Capturar imagen o video' })).toBeDisabled()
  })
})
