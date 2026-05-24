import { describe, it, expect } from 'vitest'
import { buildReflectPrompt } from './reflect-prompt'

describe('buildReflectPrompt', () => {
  const baseQuote = {
    text: 'Las palabras son escaleras gastadas.',
    entity: { name: 'Pizarnik', type: 'autor' },
  }

  it('produce un prompt sin bloque de vecinos cuando neighbors está vacío', () => {
    const messages = buildReflectPrompt(baseQuote)
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    const system = messages[0].content
    expect(system).toContain('escaleras gastadas')
    expect(system).toContain('Pizarnik')
    expect(system).not.toContain('Otras citas tuyas')
    expect(system).not.toContain('resonancia clara')
  })

  it('incluye citas vecinas como contexto y la regla de lectura cruzada', () => {
    const messages = buildReflectPrompt({
      ...baseQuote,
      neighbors: [
        { text: 'Hay un cierto temblor en el lenguaje.', entityName: 'Bonnefoy' },
        { text: 'Toda palabra es un puente que cruje.', entityName: 'Anonimo' },
      ],
    })
    const system = messages[0].content
    expect(system).toContain('Otras citas tuyas')
    expect(system).toContain('Bonnefoy')
    expect(system).toContain('temblor en el lenguaje')
    expect(system).toContain('resonancia clara')
  })

  it('trunca citas vecinas largas para no inflar el prompt', () => {
    const longText = 'palabra '.repeat(80).trim() // > 180 chars
    const messages = buildReflectPrompt({
      ...baseQuote,
      neighbors: [{ text: longText, entityName: 'Largo' }],
    })
    const system = messages[0].content
    // Debe aparecer el inicio…
    expect(system).toContain('palabra palabra')
    // …pero con elipsis (la cita completa NO debe estar)
    expect(system).toContain('…')
    expect(system).not.toContain(longText)
  })

  it('respeta la reflexión propia del usuario sin sobreescribirla', () => {
    const messages = buildReflectPrompt({
      ...baseQuote,
      userReflection: 'A mí me suena a memoria.',
    })
    const system = messages[0].content
    expect(system).toContain('A mí me suena a memoria.')
    expect(system).toContain('NO la repitas')
  })
})
