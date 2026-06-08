import { describe, expect, it } from 'vitest'
import type { Annotation } from '../../../../lib/pdfStudio/model/model'
import { reduceAnnotationShortcut } from './pdfAnnotationShortcuts'

const baseText: Annotation = {
  id: 'txt',
  kind: 'text',
  text: 'Texto',
  xRatio: 0.2,
  yRatio: 0.3,
  sizeRatio: 0.04,
  color: '#222222',
  font: 'sans',
  bold: false,
  opacity: 1,
  rotation: 0,
}

const otherText: Annotation = {
  ...baseText,
  id: 'other',
  xRatio: 0.6,
}

describe('reduceAnnotationShortcut', () => {
  it('copia, corta y elimina la anotación seleccionada', () => {
    const copied = reduceAnnotationShortcut({
      annotations: [baseText, otherText],
      selectedId: 'txt',
      clipboard: null,
      key: 'c',
      mod: true,
      shift: false,
    })
    expect(copied.handled).toBe(true)
    expect(copied.clipboard).toEqual(baseText)
    expect(copied.annotations).toHaveLength(2)

    const cut = reduceAnnotationShortcut({
      annotations: [baseText, otherText],
      selectedId: 'txt',
      clipboard: null,
      key: 'x',
      mod: true,
      shift: false,
    })
    expect(cut.handled).toBe(true)
    expect(cut.clipboard).toEqual(baseText)
    expect(cut.selectedId).toBeNull()
    expect(cut.annotations.map((a) => a.id)).toEqual(['other'])

    const deleted = reduceAnnotationShortcut({
      annotations: [baseText, otherText],
      selectedId: 'txt',
      clipboard: null,
      key: 'Delete',
      mod: false,
      shift: false,
    })
    expect(deleted.handled).toBe(true)
    expect(deleted.annotations.map((a) => a.id)).toEqual(['other'])
  })

  it('pega y duplica con una copia desplazada y seleccionada', () => {
    const pasted = reduceAnnotationShortcut({
      annotations: [baseText],
      selectedId: null,
      clipboard: baseText,
      key: 'v',
      mod: true,
      shift: false,
    })
    expect(pasted.handled).toBe(true)
    expect(pasted.annotations).toHaveLength(2)
    const copy = pasted.annotations[1]!
    expect(copy.id).not.toBe(baseText.id)
    expect(copy.kind).toBe('text')
    if (copy.kind !== 'text') throw new Error('expected text annotation')
    expect(copy.xRatio).toBeCloseTo(0.23)
    expect(copy.yRatio).toBeCloseTo(0.33)
    expect(pasted.selectedId).toBe(copy.id)

    const duplicated = reduceAnnotationShortcut({
      annotations: [baseText],
      selectedId: 'txt',
      clipboard: null,
      key: 'd',
      mod: true,
      shift: false,
    })
    expect(duplicated.handled).toBe(true)
    expect(duplicated.annotations).toHaveLength(2)
    expect(duplicated.clipboard).toBeNull()
  })

  it('mueve con flechas finas y con Shift en paso amplio', () => {
    const fine = reduceAnnotationShortcut({
      annotations: [baseText],
      selectedId: 'txt',
      clipboard: null,
      key: 'ArrowRight',
      mod: false,
      shift: false,
    })
    expect(fine.handled).toBe(true)
    if (fine.annotations[0]!.kind !== 'text') throw new Error('expected text annotation')
    expect(fine.annotations[0]!.xRatio).toBeCloseTo(0.21)

    const large = reduceAnnotationShortcut({
      annotations: [baseText],
      selectedId: 'txt',
      clipboard: null,
      key: 'ArrowUp',
      mod: false,
      shift: true,
    })
    expect(large.handled).toBe(true)
    if (large.annotations[0]!.kind !== 'text') throw new Error('expected text annotation')
    expect(large.annotations[0]!.yRatio).toBeCloseTo(0.25)
  })

  it('ignora comandos sin selección o sin portapapeles requerido', () => {
    const list = [baseText]
    const untouched = reduceAnnotationShortcut({
      annotations: list,
      selectedId: null,
      clipboard: null,
      key: 'v',
      mod: true,
      shift: false,
    })
    expect(untouched.handled).toBe(false)
    expect(untouched.annotations).toBe(list)

    const noSelection = reduceAnnotationShortcut({
      annotations: [baseText],
      selectedId: null,
      clipboard: null,
      key: 'Delete',
      mod: false,
      shift: false,
    })
    expect(noSelection.handled).toBe(false)
  })

  it('ignora comandos mutantes sobre una anotación bloqueada', () => {
    const locked: Annotation = { ...baseText, locked: true }

    for (const key of ['x', 'd', 'Delete', 'ArrowRight']) {
      const result = reduceAnnotationShortcut({
        annotations: [locked, otherText],
        selectedId: 'txt',
        clipboard: null,
        key,
        mod: key === 'x' || key === 'd',
        shift: false,
      })
      expect(result.handled).toBe(false)
      expect(result.annotations).toEqual([locked, otherText])
    }

    const copied = reduceAnnotationShortcut({
      annotations: [locked],
      selectedId: 'txt',
      clipboard: null,
      key: 'c',
      mod: true,
      shift: false,
    })
    expect(copied.handled).toBe(true)
    expect(copied.clipboard).toEqual(locked)
  })
})
