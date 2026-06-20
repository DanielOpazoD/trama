import { describe, expect, it } from 'vitest'
import {
  TEST_USERS,
  assertSqlValuesContainUser,
  buildApiRequest,
  buildFormData,
  buildJsonApiRequest,
  buildMomentoRow,
  buildNoteRow,
  buildNotasAttachmentRow,
  buildRecorteRow,
  buildUserPair,
  testAuthHeaders,
} from './test-fixtures'

describe('Netlify test fixtures', () => {
  it('builds stable users and auth headers for multiuser tests', () => {
    const pair = buildUserPair()

    expect(pair).toEqual({
      a: TEST_USERS.a,
      b: TEST_USERS.b,
    })
    expect(testAuthHeaders(TEST_USERS.a, { requestId: 'rid-a' })).toEqual({
      authorization: 'Bearer token-user-a',
      'x-request-id': 'rid-a',
    })
  })

  it('builds JSON requests with auth, query params and explicit content type', async () => {
    const req = buildJsonApiRequest('/api/recortes', {
      method: 'POST',
      user: TEST_USERS.a,
      query: { status: 'pending', empty: null },
      requestId: 'rid-json',
      json: { text: 'captura' },
    })

    expect(req.url).toBe('http://localhost/api/recortes?status=pending')
    expect(req.method).toBe('POST')
    expect(req.headers.get('authorization')).toBe('Bearer token-user-a')
    expect(req.headers.get('content-type')).toBe('application/json')
    expect(req.headers.get('x-request-id')).toBe('rid-json')
    expect(await req.json()).toEqual({ text: 'captura' })
  })

  it('builds anonymous requests and form-data bodies without JSON content type', async () => {
    const form = buildFormData({
      fields: { ownerType: 'note', ownerId: 'n1' },
      files: [{ name: 'file', fileName: 'foto.png', type: 'image/png', contents: 'png' }],
    })
    const req = buildApiRequest('/api/notas-attachments-upload', {
      method: 'POST',
      formData: form,
    })

    expect(req.headers.get('authorization')).toBeNull()
    expect(req.headers.get('content-type')).not.toBe('application/json')
    const body = await req.formData()
    expect(body.get('ownerType')).toBe('note')
    expect(body.get('ownerId')).toBe('n1')
    expect(body.get('file')).toBeInstanceOf(File)
  })

  it('builds domain rows with explicit ownership defaults', () => {
    expect(buildNoteRow({ id: 'n1', user_id: TEST_USERS.a.id })).toMatchObject({
      id: 'n1',
      user_id: 'user_test_a',
      content: 'nota de prueba',
      has_images: false,
      has_audio: false,
    })
    expect(buildRecorteRow({ id: 'r1', user_id: TEST_USERS.b.id })).toMatchObject({
      id: 'r1',
      user_id: 'user_test_b',
      text: 'recorte de prueba',
      status: 'pending',
    })
    expect(buildMomentoRow({ id: 'm1', owner_user_id: TEST_USERS.a.id })).toMatchObject({
      id: 'm1',
      user_id: 'user_test_a',
      owner_user_id: 'user_test_a',
      kind: 'nota',
    })
    expect(
      buildNotasAttachmentRow({
        id: 'a1',
        owner_id: 'n1',
        user_id: TEST_USERS.a.id,
      }),
    ).toMatchObject({
      id: 'a1',
      owner_type: 'note',
      owner_id: 'n1',
      user_id: 'user_test_a',
      storage_key: 'user_test_a/notas/a1.txt',
    })
  })

  it('asserts SQL values contain the expected user id', () => {
    expect(() =>
      assertSqlValuesContainUser(
        { template: 'SELECT * FROM notes WHERE user_id = ?', values: ['user_test_a'] },
        TEST_USERS.a,
      ),
    ).not.toThrow()

    expect(() =>
      assertSqlValuesContainUser(
        { template: 'SELECT * FROM notes', values: ['user_test_b'] },
        TEST_USERS.a,
      ),
    ).toThrow(/user_test_a/)
  })
})
