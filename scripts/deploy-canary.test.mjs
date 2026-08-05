import { describe, expect, it } from 'vitest'
import { GRACE_MS, evaluateDeploy } from './deploy-canary.mjs'

// Escenario base: main mergeado hace 2×GRACE (la gracia ya venció) y
// producción respondió bien. Cada test pisa solo lo que le importa.
const MAIN_SHA = 'aaaa111122223333444455556666777788889999'
const OLD_SHA = 'bbbb111122223333444455556666777788889999'
const NOW = 1_700_000_000_000

function base(overrides = {}) {
  return {
    prod: { ok: true, sha: MAIN_SHA },
    mainSha: MAIN_SHA,
    mainCommitMs: NOW - GRACE_MS * 2,
    nowMs: NOW,
    prodShaEnMain: true,
    ...overrides,
  }
}

describe('evaluateDeploy', () => {
  it('producción sirviendo origin/main exacto: ok, sin alarma', () => {
    const r = evaluateDeploy(base())
    expect(r.verdict).toBe('ok')
    expect(r.alarm).toBe(false)
  })

  it('sha viejo de main con la gracia vencida: DESFASE con alarma — el incidente de julio', () => {
    const r = evaluateDeploy(base({ prod: { ok: true, sha: OLD_SHA } }))
    expect(r.verdict).toBe('desfase')
    expect(r.alarm).toBe(true)
  })

  it('sha viejo pero main recién mergeado: esperando (deploy en vuelo), sin alarma', () => {
    const r = evaluateDeploy(
      base({
        prod: { ok: true, sha: OLD_SHA },
        mainCommitMs: NOW - Math.floor(GRACE_MS / 2),
      }),
    )
    expect(r.verdict).toBe('esperando')
    expect(r.alarm).toBe(false)
  })

  it('sin version.json válido pasada la gracia: alarma — el build no emite o nunca publicó', () => {
    const r = evaluateDeploy(base({ prod: { ok: false, sha: null } }))
    expect(r.verdict).toBe('sin-version')
    expect(r.alarm).toBe(true)
  })

  it('sin version.json pero main reciente: esperando — el deploy que lo trae va en vuelo', () => {
    const r = evaluateDeploy(
      base({
        prod: { ok: false, sha: null },
        mainCommitMs: NOW - Math.floor(GRACE_MS / 2),
      }),
    )
    expect(r.verdict).toBe('esperando')
    expect(r.alarm).toBe(false)
  })

  it('sha que NO pertenece a main: alarma inmediata aunque haya gracia — el tiempo no arregla un rollback', () => {
    const r = evaluateDeploy(
      base({
        prod: { ok: true, sha: OLD_SHA },
        prodShaEnMain: false,
        // Gracia todavía activa: no debe importar.
        mainCommitMs: NOW - Math.floor(GRACE_MS / 2),
      }),
    )
    expect(r.verdict).toBe('desconocido')
    expect(r.alarm).toBe(true)
  })

  it('justo en el borde de la gracia (== GRACE_MS): ya no hay gracia', () => {
    const r = evaluateDeploy(
      base({ prod: { ok: true, sha: OLD_SHA }, mainCommitMs: NOW - GRACE_MS }),
    )
    expect(r.verdict).toBe('desfase')
  })
})
