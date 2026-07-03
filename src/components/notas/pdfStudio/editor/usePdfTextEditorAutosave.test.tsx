import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makePdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import {
  PDF_EDITOR_AUTOSAVE_DELAY_MS,
  usePdfTextEditorAutosave,
} from './usePdfTextEditorAutosave'

const campo = makePdfFormFieldDraft({
  fieldKind: 'text',
  pageId: 'p1',
  name: 'paciente',
  value: '',
  xRatio: 0.1,
  yRatio: 0.2,
  wRatio: 0.3,
  hRatio: 0.05,
})

function renderAutosave(onAutosave: (edits: unknown) => void, enabled = true) {
  return renderHook(
    ({ formFields, xMarkSize }) =>
      usePdfTextEditorAutosave({
        docSettings: { watermark: { text: 'borrador' } },
        edited: {},
        enabled,
        formFields,
        onAutosave,
        xMarkSize,
        xMarkStroke: 0.006,
      }),
    { initialProps: { formFields: [campo], xMarkSize: 0.02 } },
  )
}

describe('usePdfTextEditorAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('no guarda al montar; protege tras el debounce cuando cambian los casilleros', () => {
    const onAutosave = vi.fn()
    const hook = renderAutosave(onAutosave)

    act(() => {
      vi.advanceTimersByTime(PDF_EDITOR_AUTOSAVE_DELAY_MS * 2)
    })
    expect(onAutosave).not.toHaveBeenCalled()

    const renombrado = [{ ...campo, name: 'diagnostico' }]
    hook.rerender({ formFields: renombrado, xMarkSize: 0.02 })
    act(() => {
      vi.advanceTimersByTime(PDF_EDITOR_AUTOSAVE_DELAY_MS)
    })

    expect(onAutosave).toHaveBeenCalledTimes(1)
    expect(onAutosave).toHaveBeenCalledWith({
      annotations: {},
      formFields: renombrado,
      settings: { watermark: { text: 'borrador' }, xMarkSize: 0.02, xMarkStroke: 0.006 },
    })
  })

  it('reinicia el debounce con cambios seguidos: un solo guardado al final', () => {
    const onAutosave = vi.fn()
    const hook = renderAutosave(onAutosave)

    hook.rerender({ formFields: [{ ...campo, name: 'a' }], xMarkSize: 0.02 })
    act(() => {
      vi.advanceTimersByTime(PDF_EDITOR_AUTOSAVE_DELAY_MS - 100)
    })
    hook.rerender({ formFields: [{ ...campo, name: 'b' }], xMarkSize: 0.02 })
    act(() => {
      vi.advanceTimersByTime(PDF_EDITOR_AUTOSAVE_DELAY_MS)
    })

    expect(onAutosave).toHaveBeenCalledTimes(1)
    expect(onAutosave.mock.calls[0]?.[0]).toMatchObject({
      formFields: [expect.objectContaining({ name: 'b' })],
    })
  })

  it('no protege nada cuando está deshabilitado (modo llenar)', () => {
    const onAutosave = vi.fn()
    const hook = renderAutosave(onAutosave, false)

    hook.rerender({ formFields: [{ ...campo, name: 'x' }], xMarkSize: 0.03 })
    act(() => {
      vi.advanceTimersByTime(PDF_EDITOR_AUTOSAVE_DELAY_MS * 3)
    })

    expect(onAutosave).not.toHaveBeenCalled()
  })
})
