import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { PdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import { makePdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
import { usePdfTextEditorFormHistory } from './usePdfTextEditorFormHistory'

const campo = (name: string) =>
  makePdfFormFieldDraft({
    fieldKind: 'text',
    pageId: 'p1',
    name,
    value: '',
    xRatio: 0.1,
    yRatio: 0.2,
    wRatio: 0.3,
    hRatio: 0.05,
  })

function renderHistory(initial: PdfFormFieldDraft[] = []) {
  return renderHook(() => {
    const [fields, setFields] = useState<PdfFormFieldDraft[]>(initial)
    const history = usePdfTextEditorFormHistory({ fields, setFields })
    return { fields, setFields, ...history }
  })
}

describe('usePdfTextEditorFormHistory', () => {
  it('⌘Z deshace la última operación discreta y ⇧⌘Z la rehace', () => {
    const hook = renderHistory()
    const a = campo('a')

    act(() => {
      hook.result.current.commitFields([a])
    })
    expect(hook.result.current.fields).toEqual([a])

    let undone = false
    act(() => {
      undone = hook.result.current.undoFields()
    })
    expect(undone).toBe(true)
    expect(hook.result.current.fields).toEqual([])

    act(() => {
      hook.result.current.undoFields(true)
    })
    expect(hook.result.current.fields).toEqual([a])
  })

  it('un gesto continuo cuenta como UN paso: el drag completo se deshace junto', () => {
    const a = campo('a')
    const hook = renderHistory([a])

    act(() => {
      hook.result.current.beginFieldsGesture()
      // Moves en vivo con el setter crudo (sin snapshots intermedios).
      hook.result.current.setFields([{ ...a, xRatio: 0.2 }])
      hook.result.current.setFields([{ ...a, xRatio: 0.3 }])
      hook.result.current.setFields([{ ...a, xRatio: 0.4 }])
    })
    expect(hook.result.current.fields[0]?.xRatio).toBe(0.4)

    act(() => {
      hook.result.current.undoFields()
    })
    expect(hook.result.current.fields[0]?.xRatio).toBe(0.1)
    // Y no queda un segundo paso a medio camino.
    let undoneAgain = true
    act(() => {
      undoneAgain = hook.result.current.undoFields()
    })
    expect(undoneAgain).toBe(false)
  })

  it('sin historia devuelve false (el caller cae al historial de anotaciones)', () => {
    const hook = renderHistory()
    let undone = true
    act(() => {
      undone = hook.result.current.undoFields()
    })
    expect(undone).toBe(false)
  })

  it('un cambio nuevo tras deshacer descarta el futuro (sin rehacer fantasma)', () => {
    const hook = renderHistory()
    const a = campo('a')
    const b = campo('b')

    act(() => {
      hook.result.current.commitFields([a])
    })
    act(() => {
      hook.result.current.undoFields()
    })
    act(() => {
      hook.result.current.commitFields([b])
    })
    let redone = true
    act(() => {
      redone = hook.result.current.undoFields(true)
    })
    expect(redone).toBe(false)
    expect(hook.result.current.fields).toEqual([b])
  })
})
