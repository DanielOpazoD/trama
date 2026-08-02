import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

vi.mock('./db.js', () => setupMockSql())

const { getMetadata, list } = vi.hoisted(() => ({
  getMetadata: vi.fn(async () => ({ contentType: 'image/jpeg' })),
  list: vi.fn(async () => ({ blobs: [] as Array<{ key: string }> })),
}))

vi.mock('@netlify/blobs', () => ({
  getStore: () => ({
    getMetadata,
    list,
  }),
}))

vi.mock('./embeddings.js', () => ({
  embedSafe: vi.fn(async () => ({ vector: [0.1, 0.2], model: 'test-embed' })),
  toPgVector: (v: number[]) => `[${v.join(',')}]`,
}))

// La firma SigV4 real no aporta nada acá: el mock conserva la URL para poder
// distinguir el LIST del HEAD, que es lo que este endpoint decide.
vi.mock('aws4fetch', () => ({
  AwsClient: class {
    sign = async (req: Request) => new Request(req.url, { method: req.method })
  },
}))

import handler from '../momentos-orphaned-blobs'

/** El userId que resuelve `getAuthedUser` en tests (fallback legacy). */
const USER = 'legacy-single-user'

function listXml(keys: string[]): string {
  const contents = keys
    .map((k) => `<Contents><Key>${k}</Key><Size>2048</Size></Contents>`)
    .join('')
  return `<ListBucketResult><IsTruncated>false</IsTruncated>${contents}</ListBucketResult>`
}

/**
 * Deja R2 "configurado" y enruta el fetch global: el LIST devuelve `keys`, el
 * HEAD devuelve `headStatus`. Devuelve el mock para poder afirmar sobre las
 * llamadas (p. ej. que el LIST fue con el prefijo del usuario).
 */
function stubR2({ keys = [] as string[], headStatus = 200 } = {}) {
  vi.stubEnv('R2_ACCOUNT_ID', 'acc123')
  vi.stubEnv('R2_ACCESS_KEY_ID', 'key123')
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret123')
  vi.stubEnv('R2_BUCKET', 'trama-media')
  const fetchMock = vi.fn(async (req: Request) => {
    if (new URL(req.url).searchParams.get('list-type') === '2') {
      return new Response(listXml(keys))
    }
    return new Response(null, {
      status: headStatus,
      headers: { 'content-length': '2048' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('momentos-orphaned-blobs endpoint', () => {
  beforeEach(() => {
    mockSqlResponses.reset()
    getMetadata.mockClear()
    list.mockClear()
    getMetadata.mockResolvedValue({ contentType: 'image/jpeg' })
    list.mockResolvedValue({ blobs: [] })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('GET no marca como huérfanas fotos referenciadas en payload photos legado', async () => {
    list.mockResolvedValue({
      blobs: [
        { key: 'legacy/a.jpg' },
        { key: 'legacy/b.jpg' },
        { key: 'legacy/audio.webm' },
        { key: 'orphan.jpg' },
      ],
    })
    mockSqlResponses.push([
      {
        payload: {
          photos: [{ storageKey: 'legacy/a.jpg' }, { storageKey: 'legacy/b.jpg' }],
          primaryStorageKey: 'legacy/a.jpg',
          audioKey: 'legacy/audio.webm',
        },
      },
    ])

    const res = await handler(
      new Request('http://localhost/api/momentos-orphaned-blobs'),
      mockContext(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      orphans: ['orphan.jpg'],
      referenced: 3,
      totalInStore: 4,
    })
  })

  it('POST adopta un blob y escribe el embedding en el INSERT, scopeado por user_id', async () => {
    mockSqlResponses.push(
      [], // ensureUserRow
      [], // collectReferencedKeys
      [
        {
          id: '11111111-1111-4111-8111-111111111111',
          kind: 'foto',
          captured_at: '2026-05-31T00:00:00.000Z',
          payload: { storageKey: 'preview/photo.jpg' },
          note: 'foto rescatada',
          origin: { kind: 'imported', importedFrom: 'orphaned-blob-rescue' },
          created_at: '2026-05-31T00:00:00.000Z',
          updated_at: '2026-05-31T00:00:00.000Z',
        },
      ], // INSERT momento (embedding incluido) RETURNING
    )

    const res = await handler(
      new Request('http://localhost/api/momentos-orphaned-blobs', {
        method: 'POST',
        body: JSON.stringify({
          storageKey: 'preview/photo.jpg',
          note: 'foto rescatada',
        }),
      }),
      mockContext(),
    )

    expect(res.status).toBe(201)
    // El embedding va en el INSERT (sin UPDATE posterior): atómico y scopeado.
    const insert = mockSqlState.calls.find((call) =>
      /INSERT INTO momentos/i.test(call.template),
    )
    expect(insert?.template).toMatch(/embedding/i)
    expect(insert?.values).toContain('legacy-single-user')
    expect(
      mockSqlState.calls.some((c) => /UPDATE momentos\s+SET embedding/i.test(c.template)),
    ).toBe(false)
  })

  describe('media de R2 (videos, el caso que más ocupa)', () => {
    const huerfano = `${USER}/r2-aaaa1111.mp4`
    const referenciado = `${USER}/r2-bbbb2222.mp4`
    const deLaBiblioteca = `${USER}/cccc3333.pdf`

    it('GET lista el video r2- huérfano y NO el referenciado por un momento', async () => {
      // Los tres conviven bajo el mismo prefijo del usuario en el bucket, que es
      // compartido con la Biblioteca. Solo uno es huérfano de Momentos.
      const fetchMock = stubR2({ keys: [huerfano, referenciado, deLaBiblioteca] })
      list.mockResolvedValue({ blobs: [{ key: `${USER}/foto-chica.jpg` }] })
      mockSqlResponses.push([
        { payload: { items: [{ storageKey: referenciado, type: 'video' }] } },
      ])

      const res = await handler(
        new Request('http://localhost/api/momentos-orphaned-blobs'),
        mockContext(),
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      // El huérfano de R2 aparece; el referenciado no. Y la foto chica de
      // Netlify Blobs sigue apareciendo: el barrido no cambió de backend, sumó.
      expect(body.orphans).toEqual([`${USER}/foto-chica.jpg`, huerfano])
      // El PDF de la Biblioteca vive en el mismo bucket y bajo el mismo prefijo,
      // pero no lleva el marcador `r2-` de Momentos: adoptarlo crearía un
      // momento apuntando a un archivo de otro dominio.
      expect(body.orphans).not.toContain(deLaBiblioteca)
      expect(body.scanned).toEqual({ netlifyBlobs: 1, r2: 2 })
      expect(body.partial).toBe(false)

      const listUrl = new URL((fetchMock.mock.calls[0]![0] as Request).url)
      expect(listUrl.searchParams.get('prefix')).toBe(`${USER}/`)
    })

    it('GET informa r2:null cuando R2 no está configurado (no miré ≠ no había)', async () => {
      list.mockResolvedValue({ blobs: [{ key: `${USER}/foto.jpg` }] })
      mockSqlResponses.push([])

      const res = await handler(
        new Request('http://localhost/api/momentos-orphaned-blobs'),
        mockContext(),
      )

      const body = await res.json()
      expect(body.scanned).toEqual({ netlifyBlobs: 1, r2: null })
      expect(body.orphans).toEqual([`${USER}/foto.jpg`])
    })

    it('POST adopta un video de R2 comprobando el HEAD y lo marca type video', async () => {
      const fetchMock = stubR2({ headStatus: 200 })
      mockSqlResponses.push(
        [], // ensureUserRow
        [], // collectReferencedKeys
        [{ id: '22222222-2222-4222-8222-222222222222', kind: 'foto' }], // INSERT
      )

      const res = await handler(
        new Request('http://localhost/api/momentos-orphaned-blobs', {
          method: 'POST',
          body: JSON.stringify({ storageKey: huerfano }),
        }),
        mockContext(),
      )

      expect(res.status).toBe(201)
      // La existencia se comprobó en R2 (HEAD), no en el store de blobs: un
      // getMetadata sobre una key de R2 daría null y el rescate fallaría con
      // un 404 mentiroso.
      expect((fetchMock.mock.calls[0]![0] as Request).method).toBe('HEAD')
      expect(getMetadata).not.toHaveBeenCalled()

      const insert = mockSqlState.calls.find((c) =>
        /INSERT INTO momentos/i.test(c.template),
      )
      const payload = JSON.parse(
        insert!.values.find(
          (v) => typeof v === 'string' && v.includes(huerfano),
        ) as string,
      )
      expect(payload.items).toEqual([{ storageKey: huerfano, type: 'video' }])
    })

    it('POST no adopta una key r2- de otro usuario', async () => {
      const fetchMock = stubR2({ headStatus: 200 })
      mockSqlResponses.push([]) // ensureUserRow

      const res = await handler(
        new Request('http://localhost/api/momentos-orphaned-blobs', {
          method: 'POST',
          body: JSON.stringify({ storageKey: 'otro-usuario/r2-dddd4444.mp4' }),
        }),
        mockContext(),
      )

      expect(res.status).toBe(404)
      // Ni siquiera se sondea el objeto: conocer una key ajena no debe confirmar
      // que existe.
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('POST de un video CHICO (blobs) sigue yendo por el store, no por R2', async () => {
      const fetchMock = stubR2({ headStatus: 200 })
      const key = `${USER}/eeee5555.mp4`
      mockSqlResponses.push(
        [], // ensureUserRow
        [], // collectReferencedKeys
        [{ id: '33333333-3333-4333-8333-333333333333', kind: 'foto' }], // INSERT
      )

      const res = await handler(
        new Request('http://localhost/api/momentos-orphaned-blobs', {
          method: 'POST',
          body: JSON.stringify({ storageKey: key }),
        }),
        mockContext(),
      )

      expect(res.status).toBe(201)
      expect(getMetadata).toHaveBeenCalledWith(key)
      expect(fetchMock).not.toHaveBeenCalled()
      // El camino multipart también acepta video: el `type` sale de la
      // extensión, no de qué backend guarda el archivo.
      const insert = mockSqlState.calls.find((c) =>
        /INSERT INTO momentos/i.test(c.template),
      )
      const payload = JSON.parse(
        insert!.values.find((v) => typeof v === 'string' && v.includes(key)) as string,
      )
      expect(payload.items).toEqual([{ storageKey: key, type: 'video' }])
    })
  })
})
