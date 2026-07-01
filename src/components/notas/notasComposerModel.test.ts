import { describe, expect, it } from 'vitest'
import {
  captureMediaSuccessMessage,
  isCaptureMediaFile,
  isNotasComposerActive,
  resolveLinkDraft,
} from './notasComposerModel'

describe('notasComposerModel', () => {
  it('detecta enlace puro salvo forceNote', () => {
    expect(resolveLinkDraft('https://example.com/a', false)).toBe('https://example.com/a')
    expect(resolveLinkDraft('https://example.com/a', true)).toBeNull()
  })

  it('calcula actividad del composer por foco o contenido', () => {
    expect(
      isNotasComposerActive({
        composerFocused: false,
        draft: '',
        title: '',
        pendingFilesCount: 0,
      }),
    ).toBe(false)
    expect(
      isNotasComposerActive({
        composerFocused: false,
        draft: '',
        title: 'titulo',
        pendingFilesCount: 0,
      }),
    ).toBe(true)
  })

  it('clasifica media y mensajes de captura', () => {
    const image = new File(['x'], 'foto.png', { type: 'image/png' })
    const video = new File(['x'], 'clip.mp4', { type: 'video/mp4' })
    const pdf = new File(['x'], 'doc.pdf', { type: 'application/pdf' })

    expect(isCaptureMediaFile(image)).toBe(true)
    expect(isCaptureMediaFile(video)).toBe(true)
    expect(isCaptureMediaFile(pdf)).toBe(false)
    expect(captureMediaSuccessMessage([image])).toBe('Imagen guardada en tus capturas.')
    expect(captureMediaSuccessMessage([video])).toBe('Video guardado en tus capturas.')
    expect(captureMediaSuccessMessage([image, video])).toBe(
      '2 archivos guardados en tus capturas.',
    )
  })
})
