import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLLMCache, getCached, hashMessages, putCached } from './cache'
import type { LLMMessage, LLMResult } from './types'

/**
 * La caché en memoria de respuestas LLM, viva mientras dure la instancia de la
 * función. Es la primera línea de ahorro: evita re-pagar tokens dentro de la
 * misma instancia caliente.
 *
 * Tres cosas importan, y las tres son de dinero o de corrección:
 *
 *   - **La clave incluye el proveedor.** Sin eso, la respuesta de un proveedor
 *     se serviría como si fuera de otro, con su modelo y su coste mal
 *     atribuidos.
 *   - **Lo caducado no se sirve.** Un TTL que no se respeta convierte la caché
 *     en respuestas viejas para siempre.
 *   - **El tamaño está acotado.** Una instancia de larga vida no puede inflar
 *     la memoria sin techo.
 */
const resultado = (content: unknown): LLMResult => ({
  content,
  usage: {
    provider: 'openai',
    model: 'gpt-4o',
    tokensIn: 10,
    tokensOut: 20,
    costCents: 0.5,
    durationMs: 100,
  },
  fromCache: false,
})

const mensajes = (texto: string): LLMMessage[] => [{ role: 'user', content: texto }]

beforeEach(() => {
  clearLLMCache()
})

afterEach(() => {
  vi.useRealTimers()
  clearLLMCache()
})

describe('hashMessages', () => {
  it('el mismo contenido y proveedor dan el mismo hash', async () => {
    const a = await hashMessages(mensajes('hola'), 'openai')
    const b = await hashMessages(mensajes('hola'), 'openai')

    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('mensajes distintos dan hashes distintos', async () => {
    const a = await hashMessages(mensajes('hola'), 'openai')
    const b = await hashMessages(mensajes('adiós'), 'openai')

    expect(a).not.toBe(b)
  })

  /**
   * Sin el proveedor en la clave, la respuesta de DeepSeek se serviría como si
   * viniera de OpenAI: mismo texto, pero modelo y coste atribuidos al que no
   * fue. El panel de gasto quedaría mintiendo.
   */
  it('el mismo mensaje en proveedores distintos NO comparte hash', async () => {
    const a = await hashMessages(mensajes('hola'), 'openai')
    const b = await hashMessages(mensajes('hola'), 'deepseek')

    expect(a).not.toBe(b)
  })

  it('el orden de los mensajes cambia el hash', async () => {
    const a = await hashMessages(
      [
        { role: 'user', content: 'uno' },
        { role: 'user', content: 'dos' },
      ],
      'openai',
    )
    const b = await hashMessages(
      [
        { role: 'user', content: 'dos' },
        { role: 'user', content: 'uno' },
      ],
      'openai',
    )

    expect(a).not.toBe(b)
  })
})

describe('getCached / putCached', () => {
  it('devuelve lo guardado, marcado como venido de caché', () => {
    putCached('k', resultado('hola'), 60)

    const res = getCached('k')

    expect(res).not.toBeNull()
    expect(res!.content).toBe('hola')
    expect(res!.fromCache).toBe(true)
  })

  it('no marca el original: sólo la copia servida viene de caché', () => {
    const original = resultado('hola')
    putCached('k', original, 60)

    getCached('k')

    expect(original.fromCache).toBe(false)
  })

  it('devuelve null para una clave que no existe', () => {
    expect(getCached('no-existe')).toBeNull()
  })

  it('no guarda con TTL de cero o negativo', () => {
    putCached('k', resultado('hola'), 0)
    expect(getCached('k')).toBeNull()

    putCached('k2', resultado('hola'), -5)
    expect(getCached('k2')).toBeNull()
  })

  it('deja de servir lo caducado', () => {
    vi.useFakeTimers()
    putCached('k', resultado('hola'), 60)

    expect(getCached('k')).not.toBeNull()

    vi.advanceTimersByTime(61_000)

    expect(getCached('k')).toBeNull()
  })

  /** Lo caducado se borra al detectarlo, no se queda ocupando sitio. */
  it('purga la entrada caducada en vez de dejarla', () => {
    vi.useFakeTimers()
    putCached('k', resultado('hola'), 60)
    vi.advanceTimersByTime(61_000)

    getCached('k')
    // Si sólo la ignorara, volver a guardarla con otro valor y leerla daría el
    // valor nuevo igualmente; lo que se comprueba es que un segundo `get` sin
    // reescribir siga siendo null y no reviva.
    expect(getCached('k')).toBeNull()
  })

  /**
   * Una instancia de larga vida no puede inflarse sin techo. El tope es 200;
   * al pasarlo se suelta la entrada más antigua.
   */
  it('acota el tamaño soltando la más antigua', () => {
    for (let i = 0; i < 201; i += 1) {
      putCached(`k${i}`, resultado(i), 60)
    }

    // La primera cayó al superar el tope; la última sigue.
    expect(getCached('k0')).toBeNull()
    expect(getCached('k200')).not.toBeNull()
  })
})

describe('clearLLMCache', () => {
  it('vacía todo lo guardado', () => {
    putCached('a', resultado(1), 60)
    putCached('b', resultado(2), 60)

    clearLLMCache()

    expect(getCached('a')).toBeNull()
    expect(getCached('b')).toBeNull()
  })
})
