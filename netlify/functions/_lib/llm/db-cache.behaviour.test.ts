import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * La caché persistente de respuestas LLM. Existe para no volver a pagar los
 * mismos tokens tras un cold start: un round-trip a Neon cuesta ~20 ms frente
 * a ~1-3 s y ~0,05 ¢ de una llamada al proveedor.
 *
 * Dos propiedades mandan aquí, y las dos son de dinero:
 *
 *   1. **La caché nunca rompe el flujo.** Todos sus caminos de error devuelven
 *      `null` / `0` en silencio. Si eso regresara, un hipo de Neon tumbaría
 *      *todas* las llamadas al LLM — la caché pasaría de ahorro a punto único
 *      de fallo.
 *   2. **`cost_cents` llega de Postgres como STRING** (es `numeric`). Si no se
 *      convierte, el contador de gasto concatenaría en vez de sumar y el tope
 *      mensual dejaría de significar nada.
 *
 * El fichero ya tenía un test, pero mira el TEXTO FUENTE (que use `sqlTyped`),
 * no el comportamiento. De ahí el 40 % de ramas.
 */
const sqlSpy = vi.hoisted(() => vi.fn())
const getSql = vi.hoisted(() => vi.fn())
const getEnv = vi.hoisted(() => vi.fn(() => ({ AI_DB_CACHE_ENABLED: true })))

vi.mock('../db.js', () => ({
  getSql,
  // `sqlTyped` sólo tipa: devuelve la misma promesa.
  sqlTyped: (q: Promise<unknown>) => q,
}))
vi.mock('../env.js', () => ({ getEnv }))

const { getCachedFromDB, putCachedToDB, cleanupExpiredCache } = await import('./db-cache')

/** Un `sql` de plantilla etiquetada que devuelve lo que se le diga. */
function sqlQueDevuelve(filas: unknown[]) {
  const fn = vi.fn(() => Promise.resolve(filas))
  sqlSpy.mockImplementation(fn)
  return fn
}

const fila = (over: Record<string, unknown> = {}) => ({
  content: { texto: 'hola' },
  provider: 'openai',
  model: 'gpt-4o',
  tokens_in: 100,
  tokens_out: 50,
  cost_cents: '0.42', // numeric de Postgres → llega como string
  expires_at: '2099-01-01T00:00:00Z',
  ...over,
})

const resultado = () => ({
  content: { texto: 'hola' },
  usage: {
    provider: 'openai' as const,
    model: 'gpt-4o',
    tokensIn: 100,
    tokensOut: 50,
    costCents: 0.42,
    durationMs: 120,
  },
  fromCache: false,
})

beforeEach(() => {
  getEnv.mockReturnValue({ AI_DB_CACHE_ENABLED: true })
  getSql.mockImplementation(() => sqlSpy)
  sqlQueDevuelve([])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('getCachedFromDB', () => {
  it('devuelve el resultado marcado como venido de caché', async () => {
    sqlQueDevuelve([fila()])

    const res = await getCachedFromDB('hash-1')

    expect(res).not.toBeNull()
    expect(res!.fromCache).toBe(true)
    expect(res!.content).toEqual({ texto: 'hola' })
    expect(res!.usage.provider).toBe('openai')
  })

  /**
   * El bug de dinero que este fichero puede tener: `numeric` de Postgres llega
   * como texto. Sin `Number()`, sumar el gasto concatenaría («0.42» + 0.5 =
   * «0.420.5») y el tope mensual dejaría de contar.
   */
  it('convierte cost_cents de string a número', async () => {
    sqlQueDevuelve([fila({ cost_cents: '1.75' })])

    const res = await getCachedFromDB('hash-1')

    expect(res!.usage.costCents).toBe(1.75)
    expect(typeof res!.usage.costCents).toBe('number')
  })

  /** Un acierto no tardó nada: informar la duración del original sería mentir. */
  it('un acierto no reporta duración', async () => {
    sqlQueDevuelve([fila()])

    const res = await getCachedFromDB('hash-1')

    expect(res!.usage.durationMs).toBe(0)
  })

  it('devuelve null cuando no hay fila', async () => {
    sqlQueDevuelve([])

    expect(await getCachedFromDB('hash-1')).toBeNull()
  })

  it('no toca la base de datos si la caché está desactivada', async () => {
    getEnv.mockReturnValue({ AI_DB_CACHE_ENABLED: false })

    expect(await getCachedFromDB('hash-1')).toBeNull()
    expect(getSql).not.toHaveBeenCalled()
  })

  /** La caché es un ahorro, no un punto único de fallo. */
  it('si la base de datos falla, devuelve null en vez de propagar', async () => {
    getSql.mockImplementation(() => {
      throw new Error('Neon inalcanzable')
    })

    await expect(getCachedFromDB('hash-1')).resolves.toBeNull()
  })
})

describe('putCachedToDB', () => {
  it('escribe cuando la caché está activa y el TTL es positivo', async () => {
    const sql = sqlQueDevuelve([])

    await putCachedToDB('hash-1', resultado(), 300)

    expect(sql).toHaveBeenCalledTimes(1)
  })

  it('no escribe si la caché está desactivada', async () => {
    getEnv.mockReturnValue({ AI_DB_CACHE_ENABLED: false })

    await putCachedToDB('hash-1', resultado(), 300)

    expect(getSql).not.toHaveBeenCalled()
  })

  /**
   * Un TTL de cero o negativo produciría filas ya caducadas: ocupan sitio, no
   * aciertan nunca y hay que barrerlas después. Mejor no escribirlas.
   */
  it.each([0, -1, -300])('no escribe con un TTL de %i', async (ttl) => {
    await putCachedToDB('hash-1', resultado(), ttl)

    expect(getSql).not.toHaveBeenCalled()
  })

  it('si la escritura falla, no propaga el error', async () => {
    getSql.mockImplementation(() => {
      throw new Error('Neon inalcanzable')
    })

    await expect(putCachedToDB('hash-1', resultado(), 300)).resolves.toBeUndefined()
  })
})

describe('cleanupExpiredCache', () => {
  it('devuelve cuántas filas caducadas borró', async () => {
    sqlQueDevuelve([{ hash: 'a' }, { hash: 'b' }, { hash: 'c' }])

    expect(await cleanupExpiredCache()).toBe(3)
  })

  it('devuelve 0 si la caché está desactivada', async () => {
    getEnv.mockReturnValue({ AI_DB_CACHE_ENABLED: false })

    expect(await cleanupExpiredCache()).toBe(0)
    expect(getSql).not.toHaveBeenCalled()
  })

  it('devuelve 0 si la base de datos falla', async () => {
    getSql.mockImplementation(() => {
      throw new Error('Neon inalcanzable')
    })

    expect(await cleanupExpiredCache()).toBe(0)
  })
})
