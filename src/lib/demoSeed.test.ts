import { describe, expect, it } from 'vitest'

import { buildSeed } from './demoSeed'
import { extractPromptVariables, parseTags } from './demoUtils'

/**
 * La semilla del modo demo no puede contener datos que el propio sistema sería
 * incapaz de producir.
 *
 * Pasó con un prompt sembrado como `{{párrafo}}`: el extractor sólo acepta
 * identificadores ASCII, así que esa variable no se deriva de ningún texto. El
 * chip aparecía y la búsqueda por variable funcionaba… hasta la primera
 * edición, que recalcula `variables` y la hacía desaparecer. Un dato que sólo
 * existe porque se escribió a mano y que se evapora al primer guardado.
 *
 * Estas comprobaciones fijan que lo sembrado sea exactamente lo que el sistema
 * derivaría, para que la demo no prometa nada que la app no sostenga.
 */

const semilla = buildSeed()

describe('semilla del modo demo — prompts', () => {
  it('siembra una biblioteca con contenido', () => {
    // Estuvo vacía, y la sección nunca mostraba de qué iba a quien probaba Trama.
    expect(semilla.prompts.length).toBeGreaterThan(0)
  })

  it('las variables sembradas son las que derivaría el extractor', () => {
    for (const prompt of semilla.prompts) {
      const derivadas = extractPromptVariables(prompt.content as string)
      expect(prompt.variables, `prompt «${prompt.title as string}»`).toEqual(derivadas)
    }
  })

  it('las tags sembradas son las que derivaría el parser', () => {
    for (const prompt of semilla.prompts) {
      const derivadas = parseTags(
        `${prompt.title as string}\n${prompt.content as string}\n${
          (prompt.collection as string | null) ?? ''
        }`,
      )
      expect(prompt.tags, `prompt «${prompt.title as string}»`).toEqual(derivadas)
    }
  })
})

describe('semilla del modo demo — historial de prompts', () => {
  it('cada versión apunta a un prompt que existe', () => {
    const ids = new Set(semilla.prompts.map((p) => p.id))
    for (const version of semilla.prompt_versions) {
      expect(ids.has(version.prompt_id as string)).toBe(true)
    }
  })

  /**
   * Cada fila guarda el estado ANTERIOR a una edición, así que ninguna puede ser
   * idéntica al prompt tal como está hoy: sería una edición que no cambió nada.
   */
  it('ninguna versión es idéntica al prompt actual', () => {
    for (const version of semilla.prompt_versions) {
      const prompt = semilla.prompts.find((p) => p.id === version.prompt_id)!
      const mismoTexto =
        prompt.title === version.title &&
        prompt.content === version.content &&
        prompt.collection === version.collection
      expect(mismoTexto, `versión de «${prompt.title as string}»`).toBe(false)
    }
  })

  it('el historial va de la más reciente a la más antigua', () => {
    const fechas = semilla.prompt_versions.map((v) => String(v.created_at))
    const ordenadas = [...fechas].sort((a, b) => b.localeCompare(a))
    expect(fechas).toEqual(ordenadas)
  })
})
