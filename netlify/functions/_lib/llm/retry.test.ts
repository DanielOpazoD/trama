import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWithRetry, LLMTransientError } from './retry'

/**
 * `fetchWithRetry` decide dos cosas caras:
 *
 *   - **Dinero.** Cada reintento es otra llamada facturada al proveedor.
 *     Reintentar un 401 no lo arregla nunca y multiplica el gasto por tres.
 *   - **Corrección.** Sólo lo que sale envuelto en `LLMTransientError` hace
 *     que el despachador caiga a OTRO proveedor. Si un 4xx se envolviera, un
 *     bug de autenticación se disfrazaría de «proveedor caído» y se
 *     enmascararía recorriendo la cadena entera.
 *
 * Con 58 líneas y ocho ramas, era el módulo con más consecuencia por línea
 * sin un solo test.
 *
 * Los backoffs reales son 1s y 4s: con temporizadores falsos la suite no paga
 * esos cinco segundos.
 */
const respuesta = (status: number) => new Response(null, { status })

/**
 * Corre `fn` dejando que los `setTimeout` del backoff venzan al instante.
 *
 * El `catch` vacío no traga nada: la promesa original se devuelve intacta para
 * que el test afirme sobre ella. Sólo evita que el rechazo cuente como «no
 * manejado» durante el avance de los temporizadores, que ocurre antes de que
 * el llamador tenga tiempo de enganchar su propio manejador.
 */
async function sinEsperar<T>(fn: () => Promise<T>): Promise<T> {
  const promesa = fn()
  promesa.catch(() => {})
  await vi.runAllTimersAsync()
  return promesa
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('fetchWithRetry', () => {
  it('devuelve la respuesta buena sin reintentar', async () => {
    const intento = vi.fn().mockResolvedValue(respuesta(200))

    const res = await sinEsperar(() => fetchWithRetry(intento))

    expect(res.status).toBe(200)
    expect(intento).toHaveBeenCalledTimes(1)
  })

  /**
   * El caso que cuesta dinero: un 401 es un bug de credenciales, no una caída.
   * Se devuelve tal cual —sin envolver— para que el caller lo formatee y el
   * despachador NO recorra la cadena de proveedores.
   */
  it.each([400, 401, 403, 404, 422])(
    'no reintenta un %i y lo devuelve',
    async (status) => {
      const intento = vi.fn().mockResolvedValue(respuesta(status))

      const res = await sinEsperar(() => fetchWithRetry(intento))

      expect(res.status).toBe(status)
      expect(intento).toHaveBeenCalledTimes(1)
    },
  )

  it.each([500, 502, 503, 429])('reintenta un %i hasta agotar', async (status) => {
    const intento = vi.fn().mockResolvedValue(respuesta(status))

    await expect(sinEsperar(() => fetchWithRetry(intento))).rejects.toBeInstanceOf(
      LLMTransientError,
    )
    // 3 intentos: el inicial + los 2 reintentos por defecto.
    expect(intento).toHaveBeenCalledTimes(3)
  })

  it('devuelve la respuesta buena si un reintento acierta', async () => {
    const intento = vi
      .fn()
      .mockResolvedValueOnce(respuesta(503))
      .mockResolvedValueOnce(respuesta(200))

    const res = await sinEsperar(() => fetchWithRetry(intento))

    expect(res.status).toBe(200)
    expect(intento).toHaveBeenCalledTimes(2)
  })

  it('reintenta un error de red y lo envuelve como transitorio', async () => {
    const intento = vi.fn().mockRejectedValue(new Error('ECONNRESET'))

    const error = await sinEsperar(() => fetchWithRetry(intento)).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(LLMTransientError)
    expect((error as LLMTransientError).message).toBe('ECONNRESET')
    expect((error as LLMTransientError).cause).toBeInstanceOf(Error)
    expect(intento).toHaveBeenCalledTimes(3)
  })

  it('un error de red seguido de éxito no se propaga', async () => {
    const intento = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValueOnce(respuesta(200))

    const res = await sinEsperar(() => fetchWithRetry(intento))

    expect(res.status).toBe(200)
  })

  it('respeta el número de reintentos pedido', async () => {
    const intento = vi.fn().mockResolvedValue(respuesta(500))

    await expect(sinEsperar(() => fetchWithRetry(intento, 0))).rejects.toBeInstanceOf(
      LLMTransientError,
    )
    expect(intento).toHaveBeenCalledTimes(1)
  })

  /**
   * La tabla de backoff tiene tres huecos (0, 1s, 4s). Con más reintentos que
   * huecos, `delays[attempt] ?? 0` deja pasar los extra sin esperar en vez de
   * romper con `undefined`.
   */
  it('aguanta más reintentos que huecos de backoff', async () => {
    const intento = vi.fn().mockResolvedValue(respuesta(500))

    await expect(sinEsperar(() => fetchWithRetry(intento, 4))).rejects.toBeInstanceOf(
      LLMTransientError,
    )
    expect(intento).toHaveBeenCalledTimes(5)
  })

  /** Un throw que no es `Error` no debe dejar el mensaje en `undefined`. */
  it('da un mensaje legible aunque lo lanzado no sea un Error', async () => {
    const intento = vi.fn().mockRejectedValue('caída rara')

    const error = await sinEsperar(() => fetchWithRetry(intento)).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(LLMTransientError)
    expect((error as LLMTransientError).message).toBe('LLM fetch failed after retries')
    expect((error as LLMTransientError).cause).toBe('caída rara')
  })
})
