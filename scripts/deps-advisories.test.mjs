import { describe, expect, it } from 'vitest'
import {
  ACCEPTED_ADVISORIES,
  evaluateAdvisories,
  readProductionAdvisories,
} from './check-deps-advisories.mjs'

const alto = (name, ids, fixAvailable = true) => ({
  name,
  severity: 'high',
  fixAvailable,
  ids,
})

const excepcion = (advisories, reason = 'riesgo acotado por acá') =>
  new Map([['xlsx', { advisories, reason }]])

describe('check-deps-advisories', () => {
  it('bloquea un aviso alto que nadie aceptó', () => {
    const { blocking } = evaluateAdvisories(
      [alto('paquete-nuevo', ['GHSA-aaa'])],
      new Map(),
    )

    expect(blocking.map((advisory) => advisory.name)).toEqual(['paquete-nuevo'])
  })

  it('deja pasar el aviso aceptado y conserva su razón', () => {
    const accepted = excepcion(['GHSA-aaa', 'GHSA-bbb'], 'parseo aislado en un Worker')

    const { blocking, tolerated } = evaluateAdvisories(
      [alto('xlsx', ['GHSA-aaa', 'GHSA-bbb'], false)],
      accepted,
    )

    expect(blocking).toEqual([])
    expect(tolerated[0]?.reason).toBe('parseo aislado en un Worker')
  })

  it('un aviso NUEVO del mismo paquete no hereda la excepción', () => {
    // El agujero por el que se cuela una exención por paquete: la razón escrita
    // cubre CIERTOS avisos, no al paquete para siempre. Si aparece otro GHSA,
    // nadie lo evaluó y tiene que frenar el merge.
    const accepted = excepcion(['GHSA-aaa', 'GHSA-bbb'])

    const { blocking, tolerated } = evaluateAdvisories(
      [alto('xlsx', ['GHSA-aaa', 'GHSA-bbb', 'GHSA-nuevo'], false)],
      accepted,
    )

    expect(tolerated).toEqual([])
    expect(blocking[0]?.unreviewed).toEqual(['GHSA-nuevo'])
    expect(blocking[0]?.hasEntry).toBe(true)
  })

  it('no acepta un aviso sin identificador aunque el paquete tenga excepción', () => {
    const { blocking } = evaluateAdvisories(
      [alto('xlsx', [], false)],
      excepcion(['GHSA-aaa']),
    )

    expect(blocking[0]?.unreviewed).toEqual(['(aviso sin identificador)'])
  })

  it('ignora severidades que no bloquean', () => {
    const { blocking, tolerated } = evaluateAdvisories(
      [{ name: 'algo', severity: 'moderate', fixAvailable: true, ids: ['GHSA-x'] }],
      new Map(),
    )

    expect(blocking).toEqual([])
    expect(tolerated).toEqual([])
  })

  it('avisa de una excepción que ya no hace falta', () => {
    const { stale } = evaluateAdvisories([], excepcion(['GHSA-aaa']))

    expect(stale).toEqual(['xlsx'])
  })

  it('extrae el GHSA de cada aviso, siguiendo las cadenas transitivas', () => {
    const payload = JSON.stringify({
      vulnerabilities: {
        xlsx: {
          severity: 'high',
          fixAvailable: false,
          via: [
            { source: 1108110, url: 'https://github.com/advisories/GHSA-4r6h-8v6p-xvw6' },
            { source: 1108111, url: 'https://github.com/advisories/GHSA-5pgg-2g8v-p4x9' },
          ],
        },
        // Un paquete que hereda el aviso de otro: `via` trae el NOMBRE, no el aviso.
        'algo-que-usa-xlsx': { severity: 'high', fixAvailable: true, via: ['xlsx'] },
      },
    })

    expect(readProductionAdvisories(() => payload)).toEqual([
      {
        name: 'xlsx',
        severity: 'high',
        fixAvailable: false,
        ids: ['GHSA-4r6h-8v6p-xvw6', 'GHSA-5pgg-2g8v-p4x9'],
      },
      {
        name: 'algo-que-usa-xlsx',
        severity: 'high',
        fixAvailable: true,
        ids: ['GHSA-4r6h-8v6p-xvw6', 'GHSA-5pgg-2g8v-p4x9'],
      },
    ])
  })

  it('no se cuelga si dos paquetes se referencian en círculo', () => {
    const payload = JSON.stringify({
      vulnerabilities: {
        ida: { severity: 'high', fixAvailable: false, via: ['vuelta'] },
        vuelta: { severity: 'high', fixAvailable: false, via: ['ida'] },
      },
    })

    expect(readProductionAdvisories(() => payload).map((a) => a.ids)).toEqual([[], []])
  })

  it('cae al id numérico de npm cuando el aviso no trae URL de GHSA', () => {
    const payload = JSON.stringify({
      vulnerabilities: { raro: { severity: 'critical', via: [{ source: 42 }] } },
    })

    expect(readProductionAdvisories(() => payload)[0]?.ids).toEqual(['npm-42'])
  })

  it('cada excepción declarada nombra sus avisos y explica el riesgo', () => {
    expect(ACCEPTED_ADVISORIES.size).toBeGreaterThan(0)
    for (const [name, entry] of ACCEPTED_ADVISORIES) {
      expect(entry.advisories.length, name).toBeGreaterThan(0)
      // Una razón corta es una casilla marcada, no una decisión.
      expect(entry.reason.length, name).toBeGreaterThan(80)
    }
  })
})
