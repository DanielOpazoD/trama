import { describe, expect, it } from 'vitest'
import { extractPromptVariables } from './prompt-vars'

describe('extractPromptVariables', () => {
  it('detecta variables únicas en orden de aparición', () => {
    expect(
      extractPromptVariables(
        'Escribe para {{cliente}} con tono {{ tono }}. Cierra para {{cliente}}.',
      ),
    ).toEqual(['cliente', 'tono'])
  })

  it('ignora placeholders vacíos o inválidos', () => {
    expect(
      extractPromptVariables('Hola {{ }} {{a}} {{cliente-final}} {{_ok_2}}'),
    ).toEqual(['a', '_ok_2'])
  })
})
