import { describe, expect, it } from 'vitest'
import {
  ACCEPTED_ADVISORIES,
  evaluateAdvisories,
  readProductionAdvisories,
} from './check-deps-advisories.mjs'

const alto = (name, fixAvailable = true) => ({ name, severity: 'high', fixAvailable })

describe('check-deps-advisories', () => {
  it('bloquea un aviso alto que nadie aceptó', () => {
    const { blocking } = evaluateAdvisories([alto('paquete-nuevo')], new Map())

    expect(blocking.map((advisory) => advisory.name)).toEqual(['paquete-nuevo'])
  })

  it('deja pasar el aviso aceptado y conserva su razón', () => {
    const accepted = new Map([
      ['xlsx', { severities: ['high'], reason: 'parseo aislado en un Worker' }],
    ])

    const { blocking, tolerated } = evaluateAdvisories([alto('xlsx', false)], accepted)

    expect(blocking).toEqual([])
    expect(tolerated[0]?.reason).toBe('parseo aislado en un Worker')
  })

  it('no acepta una severidad distinta de la aceptada', () => {
    // Aceptar el alto de un paquete no puede volverse un salvoconducto para
    // cuando ESE MISMO paquete escale a crítico.
    const accepted = new Map([['xlsx', { severities: ['high'], reason: 'acotado' }]])

    const { blocking } = evaluateAdvisories(
      [{ name: 'xlsx', severity: 'critical', fixAvailable: false }],
      accepted,
    )

    expect(blocking.map((advisory) => advisory.severity)).toEqual(['critical'])
  })

  it('ignora severidades que no bloquean', () => {
    const { blocking, tolerated } = evaluateAdvisories(
      [{ name: 'algo', severity: 'moderate', fixAvailable: true }],
      new Map(),
    )

    expect(blocking).toEqual([])
    expect(tolerated).toEqual([])
  })

  it('avisa de una excepción que ya no hace falta', () => {
    const accepted = new Map([['viejo', { severities: ['high'], reason: 'histórica' }]])

    const { stale } = evaluateAdvisories([], accepted)

    expect(stale).toEqual(['viejo'])
  })

  it('lee el JSON de npm audit, incluso cuando sale con código de error', () => {
    const payload = JSON.stringify({
      vulnerabilities: {
        xlsx: { severity: 'high', fixAvailable: false },
        esbuild: { severity: 'low', fixAvailable: true },
      },
    })

    expect(readProductionAdvisories(() => payload)).toEqual([
      { name: 'xlsx', severity: 'high', fixAvailable: false },
      { name: 'esbuild', severity: 'low', fixAvailable: true },
    ])
  })

  it('cada excepción declarada explica por qué el riesgo está acotado', () => {
    expect(ACCEPTED_ADVISORIES.size).toBeGreaterThan(0)
    for (const [name, entry] of ACCEPTED_ADVISORIES) {
      expect(entry.severities.length, name).toBeGreaterThan(0)
      // Una razón corta es una casilla marcada, no una decisión.
      expect(entry.reason.length, name).toBeGreaterThan(80)
    }
  })
})
