import { describe, it, expect } from 'vitest'
import { buildAtlasNamingMessages, MEMBERS_IN_PROMPT } from './atlas-prompt'

describe('buildAtlasNamingMessages', () => {
  const clusters = [
    {
      members: [
        { name: 'Borges', type: 'persona' },
        { name: 'Bioy Casares', type: 'persona' },
      ],
    },
    {
      members: [
        { name: 'Spinetta', type: 'músico' },
        { name: 'Artaud', type: 'obra' },
      ],
    },
  ]

  it('produce un par system+user', () => {
    const msgs = buildAtlasNamingMessages(clusters)
    expect(msgs).toHaveLength(2)
    expect(msgs[0]!.role).toBe('system')
    expect(msgs[1]!.role).toBe('user')
  })

  it('numera los grupos desde 0 y lista a los miembros', () => {
    const user = buildAtlasNamingMessages(clusters)[1]!.content
    expect(user).toContain('Grupo 0:')
    expect(user).toContain('Grupo 1:')
    expect(user).toContain('Borges (persona)')
    expect(user).toContain('Spinetta (músico)')
  })

  it('pide JSON estricto con el shape esperado', () => {
    const system = buildAtlasNamingMessages(clusters)[0]!.content
    expect(system).toContain('"constelaciones"')
    expect(system).toContain('"index"')
  })

  it('acota la cantidad de miembros listados por grupo', () => {
    const many = {
      members: Array.from({ length: MEMBERS_IN_PROMPT + 8 }, (_, i) => ({
        name: `Entidad ${i}`,
        type: 'concepto',
      })),
    }
    const user = buildAtlasNamingMessages([many])[1]!.content
    const listed = (user.match(/- Entidad/g) ?? []).length
    expect(listed).toBe(MEMBERS_IN_PROMPT)
  })
})
