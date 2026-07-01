import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  ProposedDeleteSchema,
  ProposedEditSchema,
  ProposedEntitySchema,
  ProposedQuoteSchema,
  ProposedRelationshipSchema,
  type ProposedEntity,
  type ProposedQuote,
  type ProposedRelationship,
  type ProposedEdit,
  type ProposedEntityEdit,
  type ProposedQuoteEdit,
  type ProposedRelationshipEdit,
} from './proposal'
import type {
  ProposedEntity as TypeProposedEntity,
  ProposedQuote as TypeProposedQuote,
  ProposedEdit as TypeProposedEdit,
} from '../types'

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

describe('proposal schema types', () => {
  it('ProposedEntity inferido == re-exportado desde types', () => {
    expectTypeOf<ProposedEntity>().toEqualTypeOf<TypeProposedEntity>()
  })

  it('ProposedQuote inferido == re-exportado desde types', () => {
    expectTypeOf<ProposedQuote>().toEqualTypeOf<TypeProposedQuote>()
  })

  it('ProposedEdit es discriminated union por kind', () => {
    type Kinds = ProposedEdit['kind']
    expectTypeOf<Kinds>().toEqualTypeOf<'entity' | 'quote' | 'relationship'>()
  })

  it('ProposedEdit narrowing por kind', () => {
    const edit: ProposedEdit = {} as ProposedEdit
    if (edit.kind === 'entity') {
      expectTypeOf(edit).toEqualTypeOf<ProposedEntityEdit>()
    }
    if (edit.kind === 'quote') {
      expectTypeOf(edit).toEqualTypeOf<ProposedQuoteEdit>()
    }
    if (edit.kind === 'relationship') {
      expectTypeOf(edit).toEqualTypeOf<ProposedRelationshipEdit>()
    }
  })

  it('ProposedEntity tiene los campos canónicos', () => {
    expectTypeOf<ProposedEntity>().toHaveProperty('type').toBeString()
    expectTypeOf<ProposedEntity>().toHaveProperty('name').toBeString()
    expectTypeOf<ProposedEntity>()
      .toHaveProperty('matchedId')
      .toEqualTypeOf<string | undefined>()
  })

  it('ProposedRelationship.verification es optional', () => {
    expectTypeOf<ProposedRelationship>().toHaveProperty('verification').toEqualTypeOf<
      | {
          agreed: boolean
          note?: string
          verifier: string
        }
      | undefined
    >()
  })

  it('TypeProposedEdit shape == schema-inferida', () => {
    expectTypeOf<TypeProposedEdit>().toEqualTypeOf<ProposedEdit>()
  })
})
