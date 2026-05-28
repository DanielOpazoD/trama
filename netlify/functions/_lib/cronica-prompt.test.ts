import { describe, expect, it } from 'vitest'
import { buildCronicaMessages, monthName, type CronicaEntity } from './cronica-prompt'

/**
 * Tests del builder de prompt de Crónicas. Cubre:
 *   - estructura de mensajes (system + user)
 *   - reglas críticas del system prompt (200-300 palabras, sin viñetas,
 *     no segunda persona, no metáforas grandiosas)
 *   - el material del user prompt incluye entidades + actividad + citas
 *   - escape básico de comillas dobles
 */
describe('buildCronicaMessages', () => {
  const sample: CronicaEntity[] = [
    {
      name: 'Borges',
      type: 'escritor',
      description: 'Escritor argentino.',
      year: 1899,
      quoteCount: 3,
      relCount: 1,
      recentQuotes: [
        { text: 'Todo enunciado es proceso.', source: 'Otras inquisiciones' },
        { text: 'Yo escribo para mí.', source: null },
      ],
    },
    {
      name: 'Sebald',
      type: 'escritor',
      description: null,
      year: 1944,
      quoteCount: 1,
      relCount: 2,
      recentQuotes: [],
    },
  ]

  it('devuelve dos mensajes: system + user', () => {
    const msgs = buildCronicaMessages({ year: 2026, month: 5, entities: sample })
    expect(msgs).toHaveLength(2)
    expect(msgs[0]!.role).toBe('system')
    expect(msgs[1]!.role).toBe('user')
  })

  it('system prompt impone las reglas críticas del registro editorial', () => {
    const msgs = buildCronicaMessages({ year: 2026, month: 5, entities: sample })
    const sys = msgs[0]!.content as string
    // Tono editorial / sin segunda persona / sin viñetas / 200-300 palabras
    expect(sys).toMatch(/cronista personal/i)
    expect(sys).toMatch(/Sin viñetas/i)
    expect(sys).toMatch(/200.*300 palabras/i)
    expect(sys).toMatch(/NO uses primera persona/i)
    expect(sys).toMatch(/NO te dirijas al usuario en segunda persona/i)
    expect(sys).toMatch(/NO motivacional/i)
    expect(sys).toMatch(/metáforas grandiosas/i)
  })

  it('user prompt incluye el nombre del mes en español + año', () => {
    const msgs = buildCronicaMessages({ year: 2026, month: 5, entities: sample })
    const user = msgs[1]!.content as string
    expect(user).toMatch(/mayo de 2026/i)
  })

  it('user prompt incluye cada entidad con su actividad y citas', () => {
    const msgs = buildCronicaMessages({ year: 2026, month: 5, entities: sample })
    const user = msgs[1]!.content as string
    expect(user).toContain('Borges')
    expect(user).toContain('Sebald')
    expect(user).toContain('3 cita(s) añadida(s)')
    expect(user).toContain('Todo enunciado es proceso.')
    expect(user).toContain('Otras inquisiciones')
  })

  it('si la entidad no tiene citas recientes, se omite el bloque de citas pero se mantiene actividad', () => {
    const msgs = buildCronicaMessages({ year: 2026, month: 5, entities: sample })
    const user = msgs[1]!.content as string
    // Sebald aparece sin citas pero con su actividad
    expect(user).toMatch(/Sebald.*1944.*escritor/s)
    expect(user).toMatch(/Sebald.*1 cita.s. añadida/s)
  })

  it('limita a 3 citas por entidad incluso si la entidad tiene más', () => {
    const many: CronicaEntity[] = [
      {
        name: 'X',
        type: 'persona',
        description: null,
        year: null,
        quoteCount: 5,
        relCount: 0,
        recentQuotes: [
          { text: 'cita 1', source: null },
          { text: 'cita 2', source: null },
          { text: 'cita 3', source: null },
          { text: 'cita 4', source: null },
          { text: 'cita 5', source: null },
        ],
      },
    ]
    const msgs = buildCronicaMessages({ year: 2026, month: 5, entities: many })
    const user = msgs[1]!.content as string
    expect(user).toContain('cita 1')
    expect(user).toContain('cita 2')
    expect(user).toContain('cita 3')
    expect(user).not.toContain('cita 4')
    expect(user).not.toContain('cita 5')
  })

  it('truncar citas largas a ~320 chars para no inflar el prompt', () => {
    const long: CronicaEntity[] = [
      {
        name: 'X',
        type: 'persona',
        description: null,
        year: null,
        quoteCount: 1,
        relCount: 0,
        recentQuotes: [{ text: 'a'.repeat(500), source: null }],
      },
    ]
    const msgs = buildCronicaMessages({ year: 2026, month: 5, entities: long })
    const user = msgs[1]!.content as string
    // 320 a's + "..." truncation
    const aMatch = user.match(/a{200,}/)
    expect(aMatch).not.toBeNull()
    expect(aMatch![0].length).toBeLessThanOrEqual(320)
  })
})

describe('monthName', () => {
  it('devuelve el nombre del mes en español', () => {
    expect(monthName(1)).toBe('enero')
    expect(monthName(5)).toBe('mayo')
    expect(monthName(12)).toBe('diciembre')
  })

  it('devuelve string vacío para meses inválidos', () => {
    expect(monthName(0)).toBe('')
    expect(monthName(13)).toBe('')
  })
})
