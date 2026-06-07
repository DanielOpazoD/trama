import { describe, expect, it } from 'vitest'
import { makePdfFormFieldDraft } from '../../../lib/pdfStudio/model'
import { reduceFormFieldShortcut } from './pdfFormFieldShortcuts'

const base = makePdfFormFieldDraft({
  fieldKind: 'text',
  pageId: 'p1',
  name: 'paciente',
  value: '',
  xRatio: 0.1,
  yRatio: 0.2,
  wRatio: 0.3,
  hRatio: 0.05,
})
const other = { ...base, id: 'f-other', name: 'rut', xRatio: 0.5 }

describe('reduceFormFieldShortcut', () => {
  it('selecciona todos los casilleros disponibles', () => {
    const result = reduceFormFieldShortcut({
      fields: [base, other],
      selectedIds: [],
      clipboard: [],
      selectableIds: [base.id, other.id],
      key: 'a',
      mod: true,
      shift: false,
    })

    expect(result.handled).toBe(true)
    expect(result.selectedIds).toEqual([base.id, other.id])
  })

  it('copia, pega y duplica casilleros con ids y nombres nuevos', () => {
    const copied = reduceFormFieldShortcut({
      fields: [base],
      selectedIds: [base.id],
      clipboard: [],
      selectableIds: [base.id],
      key: 'c',
      mod: true,
      shift: false,
    })
    const pasted = reduceFormFieldShortcut({
      fields: [base],
      selectedIds: [],
      clipboard: copied.clipboard,
      selectableIds: [base.id],
      key: 'v',
      mod: true,
      shift: false,
    })
    const duplicated = reduceFormFieldShortcut({
      fields: [base],
      selectedIds: [base.id],
      clipboard: [],
      selectableIds: [base.id],
      key: 'd',
      mod: true,
      shift: false,
    })

    expect(pasted.fields).toHaveLength(2)
    expect(pasted.fields[1]?.id).not.toBe(base.id)
    expect(pasted.fields[1]?.name).not.toBe(base.name)
    expect(duplicated.fields).toHaveLength(2)
    expect(duplicated.selectedIds).toEqual([duplicated.fields[1]?.id])
  })
})
