import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PdfFormFieldDraft, PdfPage } from '../../../../lib/pdfStudio/model/model'
import type { TextStyle } from '../editor/editorStyle'
import { initialFieldBox } from './pdfTextEditorFormDefaults'
import { usePdfTextEditorFormPlacement } from './usePdfTextEditorFormPlacement'

const page: PdfPage = {
  id: 'p1',
  kind: 'image',
  sourceId: 's1',
  annotations: [],
  rotationQuarters: 0,
}

const style: TextStyle = {
  font: 'sans',
  sizeRatio: 0.04,
  bold: false,
  italic: false,
  color: '#222222',
  opacity: 1,
  rotation: 0,
}

function renderPlacement() {
  const setFields = vi.fn()
  const setSelectedIds = vi.fn()
  const hook = renderHook(() =>
    usePdfTextEditorFormPlacement({
      fields: [],
      setFields,
      setSelectedIds,
      setEditingId: vi.fn(),
      setSelectedId: vi.fn(),
      setTool: vi.fn(),
      style,
      styleDefaults: null,
      zoom: 1,
    }),
  )
  return { hook, setFields, setSelectedIds }
}

describe('usePdfTextEditorFormPlacement · quickPlaceFormField', () => {
  it('shift+clic crea un casillero de texto centrado en el punto y lo selecciona', () => {
    const { hook, setFields, setSelectedIds } = renderPlacement()

    let created = false
    act(() => {
      created = hook.result.current.quickPlaceFormField(
        { xRatio: 0.5, yRatio: 0.4 },
        page,
      )
    })

    expect(created).toBe(true)
    const updater = setFields.mock.calls[0]?.[0] as (
      fields: PdfFormFieldDraft[],
    ) => PdfFormFieldDraft[]
    const fields = updater([])
    const field = fields[0]!
    const base = initialFieldBox('text', style)
    expect(fields).toHaveLength(1)
    expect(field.fieldKind).toBe('text')
    expect(field.pageId).toBe('p1')
    expect(field.xRatio).toBeCloseTo(0.5 - base.wRatio / 2)
    expect(field.yRatio).toBeCloseTo(0.4 - base.hRatio / 2)
    expect(setSelectedIds).toHaveBeenCalledWith([field.id])
  })

  it('acota el casillero al borde cuando el clic cae en la orilla', () => {
    const { hook, setFields } = renderPlacement()

    act(() => {
      hook.result.current.quickPlaceFormField({ xRatio: 0.99, yRatio: 0.99 }, page)
    })

    const updater = setFields.mock.calls[0]?.[0] as (
      fields: PdfFormFieldDraft[],
    ) => PdfFormFieldDraft[]
    const field = updater([])[0]!
    expect(field.xRatio + field.wRatio).toBeLessThanOrEqual(1)
    expect(field.yRatio + field.hRatio).toBeLessThanOrEqual(1)
  })

  it('sin página activa no crea nada', () => {
    const { hook, setFields } = renderPlacement()

    let created = true
    act(() => {
      created = hook.result.current.quickPlaceFormField(
        { xRatio: 0.5, yRatio: 0.5 },
        undefined,
      )
    })

    expect(created).toBe(false)
    expect(setFields).not.toHaveBeenCalled()
  })
})
