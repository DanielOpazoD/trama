import { describe, expect, it, vi } from 'vitest'
import { singleFlightImport } from './singleFlightImport'

describe('singleFlightImport', () => {
  it('comparte la importación en vuelo y la ya resuelta', async () => {
    const importer = vi.fn(() => Promise.resolve('módulo'))
    const load = singleFlightImport(importer)

    const primera = load()
    expect(load()).toBe(primera)
    await expect(primera).resolves.toBe('módulo')
    expect(load()).toBe(primera)
    expect(importer).toHaveBeenCalledTimes(1)
  })

  it('olvida un fallo: el siguiente intento vuelve a importar', async () => {
    let intentos = 0
    const importer = vi.fn(() =>
      ++intentos === 1 ? Promise.reject(new Error('sin red')) : Promise.resolve('módulo'),
    )
    const load = singleFlightImport(importer)

    await expect(load()).rejects.toThrow('sin red')
    await expect(load()).resolves.toBe('módulo')
    expect(importer).toHaveBeenCalledTimes(2)
  })
})
