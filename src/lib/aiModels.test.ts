import { describe, it, expect } from 'vitest'
import { MODELS_BY_PROVIDER } from './aiModels'

/**
 * MODELS_BY_PROVIDER es la lista de atajos de modelo por provider que la UI
 * ofrece (AITaskSettings, AIModeToggle). Estos invariantes evitan entradas
 * malformadas: cada provider debe tener exactamente UN default (value ""), sin
 * values duplicados y con labels no vacíos.
 */
describe('MODELS_BY_PROVIDER', () => {
  const providers = Object.entries(MODELS_BY_PROVIDER)

  it('cubre los providers conocidos', () => {
    for (const p of ['deepseek', 'openai', 'anthropic', 'gemini']) {
      expect(MODELS_BY_PROVIDER[p]).toBeDefined()
    }
  })

  it('cada provider tiene al menos un modelo', () => {
    for (const [, models] of providers) expect(models.length).toBeGreaterThan(0)
  })

  it('cada provider tiene exactamente un default (value "")', () => {
    for (const [provider, models] of providers) {
      const defaults = models.filter((m) => m.value === '')
      expect(defaults, `${provider} debe tener un único default`).toHaveLength(1)
    }
  })

  it('no hay values duplicados dentro de un provider', () => {
    for (const [provider, models] of providers) {
      const values = models.map((m) => m.value)
      expect(new Set(values).size, `${provider} tiene values duplicados`).toBe(
        values.length,
      )
    }
  })

  it('todo modelo tiene label y notes no vacíos', () => {
    for (const [, models] of providers) {
      for (const m of models) {
        expect(m.label.trim().length).toBeGreaterThan(0)
        expect(m.notes.trim().length).toBeGreaterThan(0)
      }
    }
  })
})
