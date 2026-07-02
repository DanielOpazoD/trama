import { describe, expect, it } from 'vitest'
import {
  buildNotasComposerCta,
  captureMediaSuccessMessage,
  composerDropUnsupportedMessage,
  captureMediaFilesFrom,
  isCaptureMediaFile,
  isNotasComposerActive,
  pastedNoteImagesFrom,
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

  it('resume el CTA del composer sin duplicar lógica en el componente', () => {
    expect(
      buildNotasComposerCta({
        draft: '',
        isLinkDraft: false,
        createNoteBusy: false,
        createRecorteBusy: false,
      }),
    ).toEqual({
      disabled: true,
      label: 'Guardar nota',
      mediaHint: 'pega o suelta una imagen o video para capturarlo',
    })

    expect(
      buildNotasComposerCta({
        draft: 'https://example.com/articulo',
        isLinkDraft: true,
        createNoteBusy: false,
        createRecorteBusy: false,
      }),
    ).toMatchObject({ disabled: false, label: 'Guardar enlace' })

    expect(
      buildNotasComposerCta({
        draft: 'Apunte',
        isLinkDraft: false,
        createNoteBusy: true,
        createRecorteBusy: false,
      }),
    ).toMatchObject({ disabled: true, label: 'Guardando…' })
  })

  it('separa archivos de media, pegado y drop no soportado', () => {
    const image = new File(['x'], 'foto.png', { type: 'image/png' })
    const video = new File(['x'], 'clip.mp4', { type: 'video/mp4' })
    const pdf = new File(['x'], 'doc.pdf', { type: 'application/pdf' })

    expect(captureMediaFilesFrom([image, pdf, video])).toEqual([image, video])
    expect(pastedNoteImagesFrom([image, video, pdf])).toEqual([image])
    expect(composerDropUnsupportedMessage([pdf])).toBe(
      'Solo se pueden soltar imágenes o videos.',
    )
    expect(composerDropUnsupportedMessage([image, pdf])).toBeNull()
    expect(composerDropUnsupportedMessage([])).toBeNull()
  })
})
