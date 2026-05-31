import { describe, expect, it } from 'vitest'
import {
  ProposedDeleteSchema,
  ProposedEditSchema,
  ProposedEntitySchema,
  ProposedQuoteSchema,
  ProposedRelationshipSchema,
} from './proposal'

describe('proposal schemas', () => {
  it('valida propuestas de creación', () => {
    expect(
      ProposedEntitySchema.parse({
        matchedId: 'e1',
        type: 'persona',
        name: 'Borges',
        year: 1899,
      }),
    ).toMatchObject({ name: 'Borges' })
    expect(
      ProposedRelationshipSchema.parse({
        fromName: 'Borges',
        toName: 'Bioy',
        type: 'amistad',
        verification: { agreed: true, verifier: 'openai' },
      }),
    ).toMatchObject({ verification: { agreed: true } })
    expect(
      ProposedQuoteSchema.safeParse({ entityName: 'Borges', text: 'Un texto' }).success,
    ).toBe(true)
  })

  it('discrimina edits por kind y delete por entidad soportada', () => {
    expect(
      ProposedEditSchema.parse({
        kind: 'entity',
        id: 'e1',
        name: 'Borges',
        patch: { description: null, year: 1899 },
      }),
    ).toMatchObject({ kind: 'entity', patch: { year: 1899 } })
    expect(
      ProposedEditSchema.parse({
        kind: 'quote',
        id: 'q1',
        preview: 'texto',
        patch: { source: null, userReflection: 'nota' },
      }),
    ).toMatchObject({ kind: 'quote' })
    expect(
      ProposedDeleteSchema.safeParse({
        kind: 'relationship',
        id: 'r1',
        preview: 'Borges -> Bioy',
      }).success,
    ).toBe(true)
    expect(
      ProposedDeleteSchema.safeParse({ kind: 'moment', id: 'm1', preview: 'x' }).success,
    ).toBe(false)
  })
})
