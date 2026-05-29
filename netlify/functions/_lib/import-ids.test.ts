import { describe, it, expect } from 'vitest'
import { isUuid, resolveImportId } from './import-ids'

describe('isUuid', () => {
  it('reconoce UUIDs y rechaza slugs', () => {
    expect(isUuid('aceb42c5-d028-4ecd-af45-9b19c13e4177')).toBe(true)
    expect(isUuid('laotse')).toBe(false)
    expect(isUuid('chuang-tse-9')).toBe(false)
    expect(isUuid('')).toBe(false)
  })
})

describe('resolveImportId', () => {
  const user = 'legacy-single-user'

  it('deja un UUID entrante tal cual (en minúsculas)', () => {
    const u = 'ACEB42C5-D028-4ECD-AF45-9B19C13E4177'
    expect(resolveImportId(u, user)).toBe(u.toLowerCase())
  })

  it('convierte un slug en un UUID v5 válido', () => {
    const out = resolveImportId('laotse', user)
    expect(isUuid(out)).toBe(true)
    expect(out[14]).toBe('5') // nibble de versión
  })

  it('es determinista: mismo (slug, user) → mismo UUID (reimport idempotente)', () => {
    expect(resolveImportId('chuang-tse-9', user)).toBe(
      resolveImportId('chuang-tse-9', user),
    )
  })

  it('preserva el enlace cita→autor: entity.id y quote.entityId con el mismo slug coinciden', () => {
    const entityUuid = resolveImportId('laotse', user) // entities[].id
    const quoteRef = resolveImportId('laotse', user) // quotes[].entityId
    expect(quoteRef).toBe(entityUuid)
  })

  it('namespacea por usuario: el mismo slug de dos usuarios NO colisiona', () => {
    expect(resolveImportId('laotse', 'user_a')).not.toBe(
      resolveImportId('laotse', 'user_b'),
    )
  })

  it('slugs distintos → UUIDs distintos', () => {
    expect(resolveImportId('laotse', user)).not.toBe(resolveImportId('chuang-tse', user))
  })
})
