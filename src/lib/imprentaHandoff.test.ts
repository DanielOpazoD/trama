import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handOffFilesToImprenta,
  hasHandedOffImprentaFiles,
  IMPRENTA_HANDOFF_EVENT,
  takeHandedOffImprentaFiles,
} from './imprentaHandoff'

const foto = (name: string) => new File(['x'], name, { type: 'image/jpeg' })

describe('imprentaHandoff', () => {
  beforeEach(() => {
    takeHandedOffImprentaFiles()
  })

  it('encola, avisa con el conteo y se vacía al drenar', () => {
    const oido = vi.fn()
    window.addEventListener(IMPRENTA_HANDOFF_EVENT, oido)
    handOffFilesToImprenta([foto('a.jpg'), foto('b.jpg')])
    window.removeEventListener(IMPRENTA_HANDOFF_EVENT, oido)

    expect(oido).toHaveBeenCalledTimes(1)
    expect((oido.mock.calls[0]![0] as CustomEvent).detail).toEqual({ count: 2 })
    expect(hasHandedOffImprentaFiles()).toBe(true)
    expect(takeHandedOffImprentaFiles().map((f) => f.name)).toEqual(['a.jpg', 'b.jpg'])
    expect(hasHandedOffImprentaFiles()).toBe(false)
    expect(takeHandedOffImprentaFiles()).toEqual([])
  })

  it('acumula envíos sucesivos y no avisa si no hay nada', () => {
    const oido = vi.fn()
    window.addEventListener(IMPRENTA_HANDOFF_EVENT, oido)
    handOffFilesToImprenta([])
    handOffFilesToImprenta([foto('a.jpg')])
    handOffFilesToImprenta([foto('b.jpg')])
    window.removeEventListener(IMPRENTA_HANDOFF_EVENT, oido)
    expect(oido).toHaveBeenCalledTimes(2)
    expect(takeHandedOffImprentaFiles()).toHaveLength(2)
  })
})
