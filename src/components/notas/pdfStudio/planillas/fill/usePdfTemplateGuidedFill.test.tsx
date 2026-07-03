import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PdfFormFieldDraft } from '../../../../../lib/pdfStudio/model/model'
import { usePdfTemplateGuidedFill } from './usePdfTemplateGuidedFill'

function field(overrides: Partial<PdfFormFieldDraft>): PdfFormFieldDraft {
  return {
    id: 'f',
    fieldKind: 'text',
    pageId: 'p1',
    name: 'campo',
    value: '',
    xRatio: 0.1,
    yRatio: 0.1,
    wRatio: 0.2,
    hRatio: 0.05,
    ...overrides,
  }
}

const fields = [
  field({ id: 'a', name: 'a', yRatio: 0.1, value: 'lleno' }),
  field({ id: 'b', name: 'b', yRatio: 0.3 }),
  field({ id: 'ro', name: 'ro', yRatio: 0.4, readOnly: true }),
  field({ id: 'c', name: 'c', yRatio: 0.5, pageId: 'p2' }),
]
const pageIndexById = { p1: 0, p2: 1 }

function pressEnterOn(control: HTMLElement, shiftKey = false) {
  control.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, shiftKey }),
  )
}

function mountControl(id: string, tag: 'input' | 'select' = 'input') {
  const el = document.createElement(tag)
  el.setAttribute('data-form-field-control', id)
  document.body.appendChild(el)
  return el
}

describe('usePdfTemplateGuidedFill', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('startGuidedFill salta al primer campo pendiente (no al ya lleno)', () => {
    const jump = vi.fn()
    const hook = renderHook(() =>
      usePdfTemplateGuidedFill({
        enabled: true,
        fields,
        pageIndexById,
        jumpToFormField: jump,
      }),
    )
    hook.result.current.startGuidedFill()
    expect(jump).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
  })

  it('Enter avanza en orden visual saltando readOnly; ⇧Enter retrocede', () => {
    const jump = vi.fn()
    renderHook(() =>
      usePdfTemplateGuidedFill({
        enabled: true,
        fields,
        pageIndexById,
        jumpToFormField: jump,
      }),
    )
    const control = mountControl('b')
    pressEnterOn(control)
    expect(jump).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'c' }))
    pressEnterOn(control, true)
    expect(jump).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('en el último campo Enter no hace nada, y los select quedan fuera', () => {
    const jump = vi.fn()
    renderHook(() =>
      usePdfTemplateGuidedFill({
        enabled: true,
        fields,
        pageIndexById,
        jumpToFormField: jump,
      }),
    )
    pressEnterOn(mountControl('c'))
    pressEnterOn(mountControl('b', 'select'))
    expect(jump).not.toHaveBeenCalled()
  })

  it('deshabilitado (fuera de modo relleno) no intercepta Enter', () => {
    const jump = vi.fn()
    renderHook(() =>
      usePdfTemplateGuidedFill({
        enabled: false,
        fields,
        pageIndexById,
        jumpToFormField: jump,
      }),
    )
    pressEnterOn(mountControl('b'))
    expect(jump).not.toHaveBeenCalled()
  })
})
