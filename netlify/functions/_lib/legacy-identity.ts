export const LEGACY_USER_ID = 'legacy-single-user'

export type LegacyOwnerAliasResolution = {
  userId: typeof LEGACY_USER_ID
  reason: 'legacy_owner_mapped'
}

export type StorageKeyOwner =
  | { ownerId: string; format: 'scoped' }
  | { ownerId: typeof LEGACY_USER_ID; format: 'legacy-unscoped' }

export function isLegacyUserId(userId: string | undefined | null): boolean {
  return userId === LEGACY_USER_ID
}

export function resolveLegacyOwnerAlias({
  clerkUserId,
  legacyOwnerClerkId,
}: {
  clerkUserId: string
  legacyOwnerClerkId: string | undefined
}): LegacyOwnerAliasResolution | null {
  if (!legacyOwnerClerkId || clerkUserId !== legacyOwnerClerkId) return null
  return { userId: LEGACY_USER_ID, reason: 'legacy_owner_mapped' }
}

export function resolveStorageKeyOwner(storageKey: string): StorageKeyOwner {
  const slashIdx = storageKey.indexOf('/')
  if (slashIdx > 0) {
    return { ownerId: storageKey.slice(0, slashIdx), format: 'scoped' }
  }
  return { ownerId: LEGACY_USER_ID, format: 'legacy-unscoped' }
}

export function storageKeyBelongsToUser(
  storageKey: string,
  userId: string,
  options: { allowLegacyUnscopedForLegacyUser?: boolean } = {},
): boolean {
  const owner = resolveStorageKeyOwner(storageKey)
  if (owner.format === 'scoped') return owner.ownerId === userId
  return options.allowLegacyUnscopedForLegacyUser === true && isLegacyUserId(userId)
}
