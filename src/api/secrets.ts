import { request } from './request'

export type SecretKind =
  | 'api_key'
  | 'token'
  | 'pin'
  | 'license'
  | 'recovery_code'
  | 'password'
  | 'other'

export type Secret = {
  id: string
  label: string
  kind: SecretKind
  service: string | null
  username: string | null
  notes: string | null
  favorite: boolean
  critical: boolean
  expiresAt: string | null
  lastRotatedAt: string | null
  copiedAt: string | null
  createdAt: string
  updatedAt: string
}

type SecretRow = {
  id: string
  label: string
  kind: SecretKind
  service: string | null
  username: string | null
  notes: string | null
  favorite: boolean
  critical: boolean
  expires_at: string | null
  last_rotated_at: string | null
  copied_at: string | null
  created_at: string
  updated_at: string
}

function secretFromRow(row: SecretRow): Secret {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    service: row.service,
    username: row.username,
    notes: row.notes,
    favorite: row.favorite,
    critical: row.critical,
    expiresAt: row.expires_at,
    lastRotatedAt: row.last_rotated_at,
    copiedAt: row.copied_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export type SecretCreate = {
  label: string
  secret: string
  kind?: SecretKind
  service?: string | null
  username?: string | null
  notes?: string | null
  favorite?: boolean
  critical?: boolean
  expiresAt?: string | null
  lastRotatedAt?: string | null
}

export type SecretPatch = Partial<SecretCreate>

export const secretsApi = {
  async list(opts?: { q?: string; kind?: SecretKind }): Promise<Secret[]> {
    const params = new URLSearchParams()
    if (opts?.q) params.set('q', opts.q)
    if (opts?.kind) params.set('kind', opts.kind)
    const qs = params.toString()
    const rows = await request<SecretRow[]>(`/api/secrets${qs ? `?${qs}` : ''}`)
    return rows.map(secretFromRow)
  },
  async create(input: SecretCreate): Promise<Secret> {
    const row = await request<SecretRow>('/api/secrets', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return secretFromRow(row)
  },
  async update(id: string, patch: SecretPatch): Promise<Secret> {
    const row = await request<SecretRow>(`/api/secrets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    })
    return secretFromRow(row)
  },
  async reveal(id: string): Promise<string> {
    const res = await request<{ secret: string }>(`/api/secrets/${id}/reveal`)
    return res.secret
  },
  async markCopied(id: string): Promise<void> {
    await request(`/api/secrets/${id}/copied`, { method: 'POST' })
  },
  async remove(id: string): Promise<void> {
    await request(`/api/secrets/${id}`, { method: 'DELETE' })
  },
}
