import { describe, it, expect } from 'vitest'
import {
  buildFeedPlan,
  dayToUtcRange,
  decodeFeedCursor,
  encodeFeedCursor,
  kindsForSegment,
  likeContains,
  NotasFeedQuery,
  parseFeedParams,
} from './notas-feed.js'

describe('cursor encode/decode (keyset)', () => {
  it('round-trippea un cursor', () => {
    const c = { ts: '2026-06-10T12:00:00.000000+00', id: 'abc-123' }
    expect(decodeFeedCursor(encodeFeedCursor(c))).toEqual(c)
  })

  it('decodifica basura como null (no lanza)', () => {
    expect(decodeFeedCursor('no-es-base64-json')).toBeNull()
    expect(decodeFeedCursor(Buffer.from('{}', 'utf8').toString('base64url'))).toBeNull()
    expect(
      decodeFeedCursor(Buffer.from('{"ts":"x"}', 'utf8').toString('base64url')),
    ).toBeNull()
  })
})

describe('dayToUtcRange', () => {
  it('mapea un día a [medianoche UTC, medianoche del día siguiente)', () => {
    expect(dayToUtcRange('2026-06-10')).toEqual({
      from: '2026-06-10T00:00:00.000Z',
      to: '2026-06-11T00:00:00.000Z',
    })
  })

  it('cruza fin de mes correctamente', () => {
    expect(dayToUtcRange('2026-06-30')).toEqual({
      from: '2026-06-30T00:00:00.000Z',
      to: '2026-07-01T00:00:00.000Z',
    })
  })

  it('lanza ante un formato inválido', () => {
    expect(() => dayToUtcRange('2026/06/10')).toThrow()
  })
})

describe('kindsForSegment', () => {
  it("'todo' incluye notas y recortes", () => {
    expect(kindsForSegment('todo')).toEqual(['note', 'recorte'])
  })
  it("'escritas' solo notas", () => {
    expect(kindsForSegment('escritas')).toEqual(['note'])
  })
  it("'capturas' solo recortes", () => {
    expect(kindsForSegment('capturas')).toEqual(['recorte'])
  })
})

describe('likeContains', () => {
  it('escapa los comodines de LIKE', () => {
    expect(likeContains('50%')).toBe('%50\\%%')
    expect(likeContains('a_b')).toBe('%a\\_b%')
    expect(likeContains('c\\d')).toBe('%c\\\\d%')
  })
})

describe('NotasFeedQuery (validación)', () => {
  it('defaults: segment=todo, limit=30', () => {
    const r = NotasFeedQuery.parse({})
    expect(r.segment).toBe('todo')
    expect(r.limit).toBe(30)
  })

  it('rechaza un segmento inválido', () => {
    expect(NotasFeedQuery.safeParse({ segment: 'favoritos' }).success).toBe(false)
  })

  it('rechaza un día mal formado', () => {
    expect(NotasFeedQuery.safeParse({ day: '10-06-2026' }).success).toBe(false)
  })

  it('coacciona limit a número y respeta el techo', () => {
    expect(NotasFeedQuery.parse({ limit: '15' }).limit).toBe(15)
    expect(NotasFeedQuery.safeParse({ limit: '5000' }).success).toBe(false)
  })
})

describe('parseFeedParams', () => {
  it("trata '' como ausente (no rompe la validación)", () => {
    const sp = new URLSearchParams('segment=capturas&tag=&q=&cursor=')
    const r = parseFeedParams(sp)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.segment).toBe('capturas')
      expect(r.data.tag).toBeUndefined()
      expect(r.data.q).toBeUndefined()
    }
  })

  it('lee status, tag, q, day, limit', () => {
    const sp = new URLSearchParams(
      'segment=todo&status=pending&tag=libros&q=memoria&day=2026-06-10&limit=12',
    )
    const r = parseFeedParams(sp)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data).toMatchObject({
        segment: 'todo',
        status: 'pending',
        tag: 'libros',
        q: 'memoria',
        day: '2026-06-10',
        limit: 12,
      })
    }
  })
})

describe('buildFeedPlan', () => {
  it('arma el plan completo a partir de params validados', () => {
    const params = NotasFeedQuery.parse({
      segment: 'todo',
      status: 'pending',
      tag: 'libros',
      q: '50%',
      day: '2026-06-10',
      limit: 20,
    })
    const plan = buildFeedPlan(params)
    expect(plan).not.toBeNull()
    expect(plan!.kinds).toEqual(['note', 'recorte'])
    expect(plan!.recorteStatus).toBe('pending')
    expect(plan!.tag).toBe('libros')
    expect(plan!.qLike).toBe('%50\\%%')
    expect(plan!.dayRange).toEqual({
      from: '2026-06-10T00:00:00.000Z',
      to: '2026-06-11T00:00:00.000Z',
    })
    expect(plan!.limit).toBe(20)
    expect(plan!.cursor).toBeNull()
  })

  it("sin status, recorteStatus es 'default' (oculta archivados)", () => {
    const plan = buildFeedPlan(NotasFeedQuery.parse({ segment: 'capturas' }))
    expect(plan!.recorteStatus).toBe('default')
    expect(plan!.kinds).toEqual(['recorte'])
  })

  it('decodifica un cursor válido', () => {
    const cursor = encodeFeedCursor({ ts: '2026-06-10T12:00:00.000000+00', id: 'x' })
    const plan = buildFeedPlan(NotasFeedQuery.parse({ cursor }))
    expect(plan!.cursor).toEqual({ ts: '2026-06-10T12:00:00.000000+00', id: 'x' })
  })

  it('devuelve null ante un cursor inválido', () => {
    const plan = buildFeedPlan(NotasFeedQuery.parse({ cursor: 'basura' }))
    expect(plan).toBeNull()
  })
})
