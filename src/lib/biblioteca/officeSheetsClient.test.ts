import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfficeSheetsUnavailableError, readOfficeSheets } from './officeSheetsClient'
import { OFFICE_SHEETS_TIMEOUT_MS } from './officeSheetsContract'

type Posted = { id: number; buffer: ArrayBuffer }

/**
 * Worker de mentira que deja inspeccionar qué se le mandó y responder a mano.
 * Se crea uno por test: compartirlo haría que las llamadas se acumulen entre
 * casos y las aserciones de `terminate` dejarían de significar nada.
 */
function fakeWorkerClass() {
  const instances: FakeWorker[] = []

  class FakeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null
    onerror: ((event: unknown) => void) | null = null
    posted: Posted[] = []
    terminated = 0

    constructor() {
      instances.push(this)
    }

    postMessage(message: Posted) {
      this.posted.push(message)
    }

    terminate() {
      this.terminated += 1
    }

    /** Responde como lo haría el worker real. */
    reply(data: unknown) {
      this.onmessage?.({ data } as MessageEvent)
    }

    /** Simula un worker que se cae solo. */
    fail() {
      this.onerror?.({})
    }
  }

  return { FakeWorker, instances }
}

const originalWorker = globalThis.Worker

afterEach(() => {
  globalThis.Worker = originalWorker
  vi.useRealTimers()
})

describe('readOfficeSheets', () => {
  it('devuelve las hojas que responde el Worker', async () => {
    const { FakeWorker, instances } = fakeWorkerClass()
    globalThis.Worker = FakeWorker as never

    const promise = readOfficeSheets(new ArrayBuffer(8))
    const worker = instances[0]!
    worker.reply({
      id: worker.posted[0]!.id,
      ok: true,
      sheets: [{ name: 'Hoja1', html: '<table></table>' }],
    })

    await expect(promise).resolves.toEqual([{ name: 'Hoja1', html: '<table></table>' }])
    expect(worker.terminated).toBe(1)
  })

  it('NO cae al hilo principal cuando no hay Worker', async () => {
    // Esta es la garantía por la que existe el módulo: preferimos no
    // previsualizar la planilla antes que correr un parser con contaminación de
    // prototipo sin parche dentro del realm de la aplicación.
    // @ts-expect-error se simula un entorno sin Workers
    globalThis.Worker = undefined

    await expect(readOfficeSheets(new ArrayBuffer(8))).rejects.toBeInstanceOf(
      OfficeSheetsUnavailableError,
    )
  })

  it('NO cae al hilo principal cuando el Worker no se puede construir', async () => {
    globalThis.Worker = class {
      constructor() {
        throw new Error('CSP')
      }
    } as never

    await expect(readOfficeSheets(new ArrayBuffer(8))).rejects.toBeInstanceOf(
      OfficeSheetsUnavailableError,
    )
  })

  it('propaga el error que informa el Worker y lo termina igual', async () => {
    const { FakeWorker, instances } = fakeWorkerClass()
    globalThis.Worker = FakeWorker as never

    const promise = readOfficeSheets(new ArrayBuffer(8))
    const worker = instances[0]!
    worker.reply({ id: worker.posted[0]!.id, ok: false, message: 'archivo ilegible' })

    await expect(promise).rejects.toThrow('archivo ilegible')
    expect(worker.terminated).toBe(1)
  })

  it('termina el Worker cuando falla por error del propio hilo', async () => {
    const { FakeWorker, instances } = fakeWorkerClass()
    globalThis.Worker = FakeWorker as never

    const promise = readOfficeSheets(new ArrayBuffer(8))
    const worker = instances[0]!
    worker.fail()

    await expect(promise).rejects.toThrow('No se pudo leer la planilla.')
    expect(worker.terminated).toBe(1)
  })

  it('ignora una respuesta de otro pedido', async () => {
    const { FakeWorker, instances } = fakeWorkerClass()
    globalThis.Worker = FakeWorker as never

    const promise = readOfficeSheets(new ArrayBuffer(8))
    const worker = instances[0]!
    const id = worker.posted[0]!.id
    worker.reply({ id: id + 999, ok: true, sheets: [{ name: 'ajena', html: '' }] })
    worker.reply({ id, ok: true, sheets: [{ name: 'propia', html: '' }] })

    await expect(promise).resolves.toEqual([{ name: 'propia', html: '' }])
  })

  it('corta una planilla que no termina nunca', async () => {
    // El ReDoS sin parche puede no terminar: sin este corte el Worker quedaría
    // girando y quemando CPU hasta que se cierre la pestaña.
    vi.useFakeTimers()
    const { FakeWorker, instances } = fakeWorkerClass()
    globalThis.Worker = FakeWorker as never

    const promise = readOfficeSheets(new ArrayBuffer(8))
    const rejected = expect(promise).rejects.toThrow('tardó demasiado')
    await vi.advanceTimersByTimeAsync(OFFICE_SHEETS_TIMEOUT_MS + 10)
    await rejected

    expect(instances[0]!.terminated).toBe(1)
  })
})
