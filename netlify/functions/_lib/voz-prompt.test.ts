import { describe, it, expect } from 'vitest'
import { buildVozMessages, type VozQuote } from './voz-prompt'

/**
 * Tests del builder de "Voz de…". Cubre:
 *   - estructura system + user
 *   - el framing crítico: lectura activa / NO es la persona real / solo las citas
 *   - el material incluye las citas reunidas
 *   - el tema del usuario llega al user prompt
 *   - truncado de citas largas
 */
describe('buildVozMessages', () => {
  const quotes: VozQuote[] = [
    { text: 'El olvido es la única venganza y el único perdón.', source: 'obra' },
    { text: 'Toda escritura es una confesión cifrada.', source: null },
  ]

  const base = {
    entityName: 'Borges',
    entityType: 'escritor',
    entityDescription: 'Escritor argentino.',
    quotes,
    question: 'el tiempo',
  }

  it('devuelve dos mensajes: system + user', () => {
    const msgs = buildVozMessages(base)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]!.role).toBe('system')
    expect(msgs[1]!.role).toBe('user')
  })

  it('el system prompt impone el framing de lectura activa, no fidelidad', () => {
    const sys = buildVozMessages(base)[0]!.content as string
    expect(sys).toContain('Borges')
    expect(sys).toContain('escritor')
    expect(sys).toMatch(/lectura activa/i)
    // NO es la persona real
    expect(sys).toMatch(/No eres Borges de verdad/i)
    // sólo el material de las citas
    expect(sys).toMatch(/ÚNICAMENTE/i)
    expect(sys).toMatch(/NO inventes/i)
    // primera persona
    expect(sys).toMatch(/primera persona/i)
  })

  it('incluye las citas reunidas como sustrato', () => {
    const sys = buildVozMessages(base)[0]!.content as string
    expect(sys).toContain('única venganza')
    expect(sys).toContain('confesión cifrada')
    expect(sys).toContain('(obra)')
  })

  it('el user prompt incluye el tema preguntado', () => {
    const user = buildVozMessages(base)[1]!.content as string
    expect(user).toContain('el tiempo')
  })

  it('trunca citas largas para no inflar el prompt', () => {
    const long = 'palabra '.repeat(80).trim() // > 280 chars
    const sys = buildVozMessages({
      ...base,
      quotes: [{ text: long, source: null }],
    })[0]!.content as string
    expect(sys).toContain('…')
    expect(sys).not.toContain(long)
  })
})
