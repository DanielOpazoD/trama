import type { Secret, SecretKind } from '../../api'

export type SecretDraftInput = {
  label: string
  secret: string
  service: string
  username: string
  notes: string
  expiresAt: string
  critical: boolean
}

export type NormalizedSecretDraft = {
  label: string
  secret: string
  service: string | null
  username: string | null
  notes: string | null
  expiresAt: string | null
  critical: boolean
}

export type SecretViewModel = {
  activeFilter: SecretKind | null
  counts: Map<SecretKind, number>
  filtered: Secret[]
  stats: {
    total: number
    critical: number
    favorites: number
    expired: number
  }
}

export function normalizeSecretDraft(input: SecretDraftInput): NormalizedSecretDraft {
  return {
    label: input.label.trim(),
    secret: input.secret.trim(),
    service: input.service.trim() || null,
    username: input.username.trim() || null,
    notes: input.notes.trim() || null,
    expiresAt: input.expiresAt || null,
    critical: input.critical,
  }
}

export function buildSecretViewModel(
  secrets: Secret[],
  filter: SecretKind | null,
  now = new Date(),
): SecretViewModel {
  const counts = new Map<SecretKind, number>()
  for (const secret of secrets)
    counts.set(secret.kind, (counts.get(secret.kind) ?? 0) + 1)
  const activeFilter = filter && counts.has(filter) ? filter : null
  return {
    activeFilter,
    counts,
    filtered: activeFilter
      ? secrets.filter((secret) => secret.kind === activeFilter)
      : secrets,
    stats: {
      total: secrets.length,
      critical: secrets.filter((secret) => secret.critical).length,
      favorites: secrets.filter((secret) => secret.favorite).length,
      expired: secrets.filter((secret) => isExpired(secret.expiresAt, now)).length,
    },
  }
}

function isExpired(value: string | null, now: Date): boolean {
  if (!value) return false
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date < startOfDay(now)
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}
