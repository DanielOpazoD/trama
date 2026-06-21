import { describe, expect, it } from 'vitest'
import {
  LEGACY_USER_ID,
  isLegacyUserId,
  resolveLegacyOwnerAlias,
  resolveStorageKeyOwner,
  storageKeyBelongsToUser,
} from './legacy-identity'

describe('legacy identity helpers', () => {
  it('centraliza el identificador legacy historico', () => {
    expect(LEGACY_USER_ID).toBe('legacy-single-user')
    expect(isLegacyUserId(LEGACY_USER_ID)).toBe(true)
    expect(isLegacyUserId('user_real')).toBe(false)
  })

  it('mapea solo el owner legacy configurado hacia compatibilidad historica', () => {
    expect(
      resolveLegacyOwnerAlias({
        clerkUserId: 'user_owner',
        legacyOwnerClerkId: 'user_owner',
      }),
    ).toEqual({ userId: LEGACY_USER_ID, reason: 'legacy_owner_mapped' })

    expect(
      resolveLegacyOwnerAlias({
        clerkUserId: 'user_new',
        legacyOwnerClerkId: 'user_owner',
      }),
    ).toBeNull()
  })

  it('identifica el owner de storage keys nuevas por prefijo', () => {
    expect(resolveStorageKeyOwner('user_123/foto.webp')).toEqual({
      ownerId: 'user_123',
      format: 'scoped',
    })
  })

  it('trata storage keys sin prefijo como compatibilidad legacy explicita', () => {
    expect(resolveStorageKeyOwner('foto-vieja.webp')).toEqual({
      ownerId: LEGACY_USER_ID,
      format: 'legacy-unscoped',
    })
  })

  it('autoriza storage keys scoped solo para su owner exacto', () => {
    expect(storageKeyBelongsToUser('user_123/foto.webp', 'user_123')).toBe(true)
    expect(storageKeyBelongsToUser('user_123/foto.webp', 'user_456')).toBe(false)
  })

  it('rechaza keys legacy sin prefijo salvo cuando el caller lo permite explicitamente', () => {
    expect(storageKeyBelongsToUser('foto-vieja.webp', LEGACY_USER_ID)).toBe(false)
    expect(
      storageKeyBelongsToUser('foto-vieja.webp', LEGACY_USER_ID, {
        allowLegacyUnscopedForLegacyUser: true,
      }),
    ).toBe(true)
    expect(
      storageKeyBelongsToUser('foto-vieja.webp', 'user_123', {
        allowLegacyUnscopedForLegacyUser: true,
      }),
    ).toBe(false)
  })
})
