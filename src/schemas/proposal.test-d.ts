/**
 * G5: type-tests para schemas Zod.
 *
 * Estos NO se ejecutan en runtime — vitest los compila junto al resto y
 * `expectTypeOf` se evalúa en tiempo de compilación. Si los tipos no
 * matchean, falla `tsc -b`.
 *
 * Para qué sirven:
 *  - Detectan drift entre los tipos inferidos por `z.infer` y los re-exports
 *    en `src/types/extraction.ts`. Si alguien cambia el schema sin actualizar
 *    los consumidores, el type-test rompe.
 *  - Documentan la shape esperada. Más legible que `Type | undefined` mental.
 *
 * Si querés agregar más type-tests para otros schemas, copiá este patrón
 * con el sufijo `.test-d.ts` (vitest los recoge igual que `.test.ts`).
 */

import { describe, it, expectTypeOf } from 'vitest'
import type {
  ProposedEntity,
  ProposedQuote,
  ProposedRelationship,
  ProposedEdit,
  ProposedEntityEdit,
  ProposedQuoteEdit,
  ProposedRelationshipEdit,
} from './proposal'
import type {
  ProposedEntity as TypeProposedEntity,
  ProposedQuote as TypeProposedQuote,
  ProposedEdit as TypeProposedEdit,
} from '../types'

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
    // matchedId, year, description, spotifyUrl son optional
    expectTypeOf<ProposedEntity>().toHaveProperty('matchedId').toEqualTypeOf<string | undefined>()
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
