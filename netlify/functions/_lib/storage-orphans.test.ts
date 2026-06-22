import { describe, expect, it } from 'vitest'

import {
  classifyStorageOrphans,
  sanitizeStorageKey,
  type StorageManifestRow,
} from './storage-orphans'

const row = (
  storageKey: string,
  over: Partial<StorageManifestRow> = {},
): StorageManifestRow => ({
  provider: 'r2',
  domain: 'library-uploads',
  storageKey,
  ...over,
})

describe('classifyStorageOrphans', () => {
  it('marca manifest sin objeto cuando la fila no está en presentKeys', () => {
    const report = classifyStorageOrphans({
      provider: 'r2',
      manifestRows: [row('user-1/a.pdf')],
      presentKeys: [],
    })

    expect(report.counts.manifestWithoutObject).toBe(1)
    expect(report.counts.objectsWithoutManifest).toBe(0)
    expect(report.counts.ok).toBe(0)
    expect(report.manifestWithoutObject[0]).toMatchObject({
      provider: 'r2',
      domain: 'library-uploads',
      category: 'manifest-without-object',
    })
    // Nunca expone la key completa en claro.
    expect(report.manifestWithoutObject[0]!.sanitizedKey).not.toContain('a.pdf')
    expect(report.manifestWithoutObject[0]!.sanitizedKey).toContain('user-1/')
  })

  it('marca objeto sin manifest cuando la key existe pero no hay fila', () => {
    const report = classifyStorageOrphans({
      provider: 'r2',
      manifestRows: [],
      presentKeys: ['user-1/huerfano.pdf'],
    })

    expect(report.counts.objectsWithoutManifest).toBe(1)
    expect(report.counts.manifestWithoutObject).toBe(0)
    expect(report.objectsWithoutManifest[0]).toMatchObject({
      provider: 'r2',
      domain: '<unknown>',
      category: 'object-without-manifest',
    })
  })

  it('marca ok cuando la fila tiene su objeto presente', () => {
    const report = classifyStorageOrphans({
      provider: 'r2',
      manifestRows: [row('user-1/ok.pdf')],
      presentKeys: ['user-1/ok.pdf'],
    })

    expect(report.counts.ok).toBe(1)
    expect(report.counts.manifestWithoutObject).toBe(0)
    expect(report.counts.objectsWithoutManifest).toBe(0)
    expect(report.ok[0]).toMatchObject({ category: 'ok' })
  })

  it('clasifica una mezcla de ok, manifest sin objeto y objeto sin manifest', () => {
    const report = classifyStorageOrphans({
      provider: 'r2',
      manifestRows: [
        row('user-1/ok-1.pdf'),
        row('user-1/ok-2.pdf'),
        row('user-1/falta-objeto.pdf'),
      ],
      presentKeys: ['user-1/ok-1.pdf', 'user-1/ok-2.pdf', 'user-2/sin-manifest.pdf'],
    })

    expect(report.counts).toMatchObject({
      manifestRows: 3,
      presentKeys: 3,
      ok: 2,
      manifestWithoutObject: 1,
      objectsWithoutManifest: 1,
    })
    expect(report.manifestWithoutObject.map((i) => i.sanitizedKey)).toEqual([
      sanitizeStorageKey('user-1/falta-objeto.pdf'),
    ])
    expect(report.objectsWithoutManifest.map((i) => i.sanitizedKey)).toEqual([
      sanitizeStorageKey('user-2/sin-manifest.pdf'),
    ])
  })

  it('sin provider no computa objectsWithoutManifest (set de keys ambiguo)', () => {
    const report = classifyStorageOrphans({
      manifestRows: [row('user-1/ok.pdf')],
      presentKeys: ['user-1/ok.pdf', 'user-1/sin-fila.pdf'],
    })

    expect(report.counts.ok).toBe(1)
    // No se atribuye el objeto sobrante a ningún provider.
    expect(report.counts.objectsWithoutManifest).toBe(0)
    expect(report.objectsWithoutManifest).toEqual([])
  })

  it('es determinístico: ordena la salida sin importar el orden de entrada', () => {
    const a = classifyStorageOrphans({
      provider: 'r2',
      manifestRows: [row('user-9/z.pdf'), row('user-1/a.pdf')],
      presentKeys: [],
    })
    const b = classifyStorageOrphans({
      provider: 'r2',
      manifestRows: [row('user-1/a.pdf'), row('user-9/z.pdf')],
      presentKeys: [],
    })
    expect(a.manifestWithoutObject).toEqual(b.manifestWithoutObject)
  })

  it('no cuenta dos veces una key presente que sí tiene fila', () => {
    const report = classifyStorageOrphans({
      provider: 'r2',
      manifestRows: [row('user-1/dup.pdf')],
      presentKeys: ['user-1/dup.pdf'],
    })
    expect(report.counts.ok).toBe(1)
    expect(report.counts.objectsWithoutManifest).toBe(0)
  })
})

describe('sanitizeStorageKey', () => {
  it('emite prefijo de owner + hash, nunca la key completa', () => {
    const sanitized = sanitizeStorageKey('user-42/secreto.pdf')
    expect(sanitized).toContain('user-42/')
    expect(sanitized).not.toContain('secreto.pdf')
    expect(sanitized).toMatch(/#[0-9a-f]{8}$/)
  })

  it('usa <no-owner> cuando la key no tiene prefijo con slash', () => {
    expect(sanitizeStorageKey('legacy-sin-slash')).toContain('<no-owner>/')
  })

  it('es estable para la misma key', () => {
    expect(sanitizeStorageKey('user-1/a.pdf')).toBe(sanitizeStorageKey('user-1/a.pdf'))
  })
})
