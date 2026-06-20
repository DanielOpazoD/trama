import { expect } from 'vitest'

export const TEST_TIMESTAMP = '2026-06-10T12:00:00.000Z'

export type TestUser = {
  id: string
  token: string
  email: string
  displayName: string
}

export const TEST_USERS = {
  legacy: {
    id: 'legacy-single-user',
    token: 'legacy-token',
    email: 'legacy@example.test',
    displayName: 'Legacy User',
  },
  a: {
    id: 'user_test_a',
    token: 'token-user-a',
    email: 'a@example.test',
    displayName: 'User A',
  },
  b: {
    id: 'user_test_b',
    token: 'token-user-b',
    email: 'b@example.test',
    displayName: 'User B',
  },
} as const satisfies Record<string, TestUser>

type QueryValue = string | number | boolean | null | undefined

type BuildApiRequestOptions = {
  method?: string
  user?: TestUser | null
  token?: string | null
  requestId?: string
  headers?: Record<string, string>
  query?: Record<string, QueryValue>
  json?: unknown
  formData?: FormData
  body?: RequestInit['body']
}

export function buildUserPair() {
  return { a: TEST_USERS.a, b: TEST_USERS.b }
}

export function testAuthHeaders(
  user: TestUser = TEST_USERS.a,
  options: { token?: string; requestId?: string } = {},
) {
  return {
    authorization: `Bearer ${options.token ?? user.token}`,
    ...(options.requestId ? { 'x-request-id': options.requestId } : {}),
  }
}

function appendQuery(url: URL, query?: Record<string, QueryValue>) {
  if (!query) return
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') continue
    url.searchParams.set(key, String(value))
  }
}

export function buildApiRequest(path: string, options: BuildApiRequestOptions = {}) {
  const url = new URL(path, 'http://localhost')
  appendQuery(url, options.query)

  const headers = new Headers(options.headers)
  if (options.requestId) headers.set('x-request-id', options.requestId)
  const token = options.token ?? options.user?.token
  if (token) headers.set('authorization', `Bearer ${token}`)

  let body = options.body
  if (options.json !== undefined) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(options.json)
  }
  if (options.formData) {
    headers.delete('content-type')
    body = options.formData
  }

  return new Request(url, {
    method: options.method ?? (body ? 'POST' : 'GET'),
    headers,
    body,
  })
}

export function buildJsonApiRequest(
  path: string,
  options: Omit<BuildApiRequestOptions, 'body' | 'formData'> & { json: unknown },
) {
  return buildApiRequest(path, options)
}

export function buildFormData(input: {
  fields?: Record<string, string | Blob>
  files?: Array<{
    name: string
    fileName: string
    type: string
    contents: string | Blob
  }>
}) {
  const form = new FormData()
  for (const [key, value] of Object.entries(input.fields ?? {})) {
    form.set(key, value)
  }
  for (const file of input.files ?? []) {
    form.set(file.name, new File([file.contents], file.fileName, { type: file.type }))
  }
  return form
}

export function buildNoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n-test-1',
    user_id: TEST_USERS.legacy.id,
    content: 'nota de prueba',
    title: null,
    tags: [],
    pinned: false,
    promoted_momento_id: null,
    source: null,
    created_at: TEST_TIMESTAMP,
    updated_at: TEST_TIMESTAMP,
    has_images: false,
    has_audio: false,
    ...overrides,
  }
}

export function buildRecorteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r-test-1',
    user_id: TEST_USERS.legacy.id,
    text: 'recorte de prueba',
    source_url: null,
    source_title: null,
    source_author: null,
    note: null,
    image_url: null,
    image_key: null,
    capture_mode: 'html',
    status: 'pending',
    promoted_target: null,
    promoted_id: null,
    source: null,
    captured_at: null,
    created_at: TEST_TIMESTAMP,
    updated_at: TEST_TIMESTAMP,
    images: [],
    ...overrides,
  }
}

export function buildMomentoRow(overrides: Record<string, unknown> = {}) {
  const userId = String(
    overrides.user_id ?? overrides.owner_user_id ?? TEST_USERS.legacy.id,
  )
  return {
    id: 'm-test-1',
    user_id: userId,
    owner_user_id: userId,
    owner_display_name: null,
    owner_email: null,
    access_role: 'owner',
    shared: false,
    kind: 'nota',
    captured_at: TEST_TIMESTAMP,
    payload: { bodyText: 'momento de prueba' },
    note: null,
    origin: { kind: 'manual' },
    created_at: TEST_TIMESTAMP,
    updated_at: TEST_TIMESTAMP,
    ...overrides,
  }
}

export function buildNotasAttachmentRow(overrides: Record<string, unknown> = {}) {
  const id = String(overrides.id ?? 'a-test-1')
  const userId = String(overrides.user_id ?? TEST_USERS.legacy.id)
  return {
    id,
    user_id: userId,
    owner_type: 'note',
    owner_id: 'n-test-1',
    file_name: 'nota.txt',
    mime_type: 'text/plain',
    byte_size: 42,
    storage_key: `${userId}/notas/${id}.txt`,
    created_at: TEST_TIMESTAMP,
    updated_at: TEST_TIMESTAMP,
    ...overrides,
  }
}

export function assertSqlValuesContainUser(
  call: { template: string; values: unknown[] } | undefined,
  user: TestUser | string,
) {
  const userId = typeof user === 'string' ? user : user.id
  expect(call?.values ?? [], `SQL values must contain ${userId}`).toContain(userId)
}
