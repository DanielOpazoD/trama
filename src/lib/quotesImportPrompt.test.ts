import { describe, it, expect } from 'vitest'
import { QUOTES_IMPORT_PROMPT } from './quotesImportPrompt'
import { ENTITY_TYPES } from '../types/entity'

/**
 * QUOTES_IMPORT_PROMPT es el prompt que el usuario pega en una IA para generar
 * un JSON importable. Su docstring pide mantenerlo en sync con varios archivos;
 * estos tests son un guard de drift de lo verificable estáticamente: la
 * estructura mínima del JSON y que enumere TODOS los tipos de entidad válidos.
 */
describe('QUOTES_IMPORT_PROMPT', () => {
  it('documenta la estructura mínima del body de import', () => {
    for (const token of ['"version": 1', '"entities"', '"quotes"', '"entityId"']) {
      expect(QUOTES_IMPORT_PROMPT).toContain(token)
    }
  })

  it('enumera todos los tipos de entidad válidos (guard de drift con ENTITY_TYPES)', () => {
    // El prompt lista los `type` permitidos sin acentos; ENTITY_TYPES[].value
    // también es la forma sin acentos. Si se agrega un tipo nuevo a la fuente
    // de verdad sin actualizar el prompt, este test falla.
    for (const { value } of ENTITY_TYPES) {
      expect(QUOTES_IMPORT_PROMPT, `falta el tipo "${value}" en el prompt`).toContain(
        value,
      )
    }
  })

  it('pide responder solo con JSON válido', () => {
    expect(QUOTES_IMPORT_PROMPT.toLowerCase()).toContain('json')
    expect(QUOTES_IMPORT_PROMPT).toMatch(/ÚNICAMENTE|únicamente|SOLO|solo/)
  })
})
