import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HealthResponse } from '../types/health'
import { CONTRACTS, verifyContract, type ContractOutput } from './contracts'
import type { MomentoShareInvitation, MomentoUrlPreview } from './momentos'
import { requestContract } from './request'
import type { SavedQuery } from './savedQueries'
import type { XStatus } from './x'

// ---- El esquema no puede pedir algo que el tipo del cliente no promete. Si
// alguien cambia el tipo y olvida el esquema (o al revés), `typecheck` falla
// acá. Se comprueba en compilación; en runtime no hace nada.
// Con corchetes para que NO distribuya sobre uniones: con `XStatus` a pelo,
// el miembro `{ connected: false }` bastaba para dar `true` y el check no veía
// un campo renombrado en el miembro conectado (se comprobó por mutación).
type Satisfies<TType, TSchema> = [TType] extends [TSchema] ? true : never
void (true satisfies Satisfies<HealthResponse, ContractOutput<'health'>>)
void (true satisfies Satisfies<XStatus, ContractOutput<'xStatus'>>)
void (true satisfies Satisfies<MomentoUrlPreview, ContractOutput<'urlPreview'>>)
void (true satisfies Satisfies<{ items: SavedQuery[] }, ContractOutput<'savedQueries'>>)
void (true satisfies Satisfies<
  { items: MomentoShareInvitation[] },
  ContractOutput<'shareInvitations'>
>)

/**
 * El contrato verifica y no sustituye: la respuesta llega tal cual (campos de
 * más incluidos) y un desvío, en desarrollo y tests, rechaza la promesa con
 * el campo culpable en el mensaje.
 */
describe('requestContract', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  function respondWith(body: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(
        async () => new Response(JSON.stringify(body), { status: 200 }),
      ),
    )
  }

  it('entrega la respuesta original cuando cumple, sin recortar campos extra', async () => {
    const body = { entities: 1, quotes: 2, relationships: 3, momentos: 4, extra: 'sigue' }
    respondWith(body)
    await expect(requestContract('counts', '/api/counts')).resolves.toEqual(body)
  })

  it('en desarrollo, un desvío rechaza nombrando el contrato y el campo', async () => {
    respondWith({ entities: 1, quotes: 2, relationships: 3 })
    await expect(requestContract('counts', '/api/counts')).rejects.toThrow(
      /contrato «counts».*momentos/,
    )
  })

  it('verifyContract lista los desvíos como ruta: motivo', () => {
    expect(verifyContract('xStatus', { connected: true, counts: {} })).toContain(
      'counts.totalBookmarks: Invalid input',
    )
    expect(verifyContract('xStatus', { connected: false })).toEqual([])
  })

  it('cada contrato declara la ruta con la que la demo lo prueba', () => {
    for (const [key, contract] of Object.entries(CONTRACTS)) {
      expect(contract.path, key).toMatch(/^\/api\//)
    }
  })
})
