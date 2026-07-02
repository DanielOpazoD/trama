import { describe, expect, it } from 'vitest'
import { makePdfFormFieldDraft } from '../../../../lib/pdfStudio/model/model'
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

  it('pega corrido dentro de la misma página para no tapar el original', () => {
    const pasted = reduceFormFieldShortcut({
      fields: [base],
      selectedIds: [],
      clipboard: [base],
      selectableIds: [base.id],
      currentPageId: 'p1',
      key: 'v',
      mod: true,
      shift: false,
    })

    const copy = pasted.fields[1]
    expect(copy?.pageId).toBe('p1')
    expect(copy?.xRatio).toBeCloseTo(base.xRatio + 0.025)
    expect(copy?.yRatio).toBeCloseTo(base.yRatio + 0.025)
  })

  it('pega en la página visible cuando difiere de la página de origen', () => {
    const pasted = reduceFormFieldShortcut({
      fields: [base, other],
      selectedIds: [],
      clipboard: [base, other],
      selectableIds: [base.id, other.id],
      currentPageId: 'p3',
      key: 'v',
      mod: true,
      shift: false,
    })

    const copies = pasted.fields.slice(2)
    expect(copies).toHaveLength(2)
    expect(copies.every((field) => field.pageId === 'p3')).toBe(true)
    // Conserva posición, tamaño y estilo del original; solo cambia de página.
    expect(copies[0]?.xRatio).toBeCloseTo(base.xRatio)
    expect(copies[0]?.yRatio).toBeCloseTo(base.yRatio)
    expect(copies[0]?.wRatio).toBeCloseTo(base.wRatio)
    expect(copies[0]?.hRatio).toBeCloseTo(base.hRatio)
    expect(copies[1]?.xRatio).toBeCloseTo(other.xRatio)
    expect(pasted.selectedIds).toEqual(copies.map((field) => field.id))
    const names = pasted.fields.map((field) => field.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('acota al pegar en otra página un casillero que quedaría fuera de los límites', () => {
    const wide = { ...base, id: 'f-wide', name: 'ancho', xRatio: 0.85, wRatio: 0.3 }
    const pasted = reduceFormFieldShortcut({
      fields: [wide],
      selectedIds: [],
      clipboard: [wide],
      selectableIds: [wide.id],
      currentPageId: 'p2',
      key: 'v',
      mod: true,
      shift: false,
    })

    const copy = pasted.fields[1]
    expect(copy?.pageId).toBe('p2')
    expect((copy?.xRatio ?? 0) + (copy?.wRatio ?? 0)).toBeLessThanOrEqual(1)
  })
})
