import { describe, expect, test } from 'vitest'

import {
  collectProviderInventory,
  fetchManifestRows,
  formatOrphansJson,
  formatOrphansMarkdown,
  parseArgs,
  probePresentKeys,
  summarizeOrphans,
} from './check-storage-orphans.mjs'

/** Cliente pg falso: devuelve filas fijas para el SELECT del manifest. */
function fakeClient(rows) {
  return {
    query: async () => ({ rows }),
    end: async () => {},
  }
}

describe('check-storage-orphans (read-only)', () => {
  test('fetchManifestRows transforma snake_case a camelCase', async () => {
    const client = fakeClient([
      { provider: 'r2', domain: 'library-uploads', storage_key: 'user-1/a.pdf' },
    ])
    const rows = await fetchManifestRows(client, 'r2')
    expect(rows).toEqual([
      { provider: 'r2', domain: 'library-uploads', storageKey: 'user-1/a.pdf' },
    ])
  })

  test('probePresentKeys solo marca presentes los HEAD que existen', async () => {
    const rows = [
      { provider: 'r2', domain: 'library-uploads', storageKey: 'user-1/ok.pdf' },
      { provider: 'r2', domain: 'library-uploads', storageKey: 'user-1/falta.pdf' },
    ]
    const objectExists = async (key) => ({ exists: key.endsWith('ok.pdf'), size: null })
    const { present, warnings } = await probePresentKeys(rows, { objectExists })
    expect([...present]).toEqual(['user-1/ok.pdf'])
    expect(warnings).toEqual([])
  })

  test('probePresentKeys agrega warning sanitizado si un HEAD lanza', async () => {
    const rows = [
      { provider: 'r2', domain: 'library-uploads', storageKey: 'user-1/x.pdf' },
    ]
    const objectExists = async () => {
      throw new Error('R2 HEAD falló con status 503')
    }
    const { present, warnings } = await probePresentKeys(rows, { objectExists })
    expect(present.size).toBe(0)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('503')
    // El warning no expone la key completa en claro.
    expect(warnings[0]).not.toContain('x.pdf')
  })

  test('probePresentKeys topa en maxProbes y avisa que truncó', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      provider: 'r2',
      domain: 'library-uploads',
      storageKey: `user-1/f${i}.pdf`,
    }))
    const objectExists = async () => ({ exists: true, size: null })
    const { present, warnings, probedCount } = await probePresentKeys(rows, {
      objectExists,
      maxProbes: 2,
    })
    expect(probedCount).toBe(2)
    expect(present.size).toBe(2)
    expect(warnings.some((w) => w.includes('2/3'))).toBe(true)
  })

  test('collectProviderInventory cruza manifest vs HEAD con deps inyectadas', async () => {
    const client = fakeClient([
      { provider: 'r2', domain: 'library-uploads', storage_key: 'user-1/ok.pdf' },
      { provider: 'r2', domain: 'library-uploads', storage_key: 'user-1/falta.pdf' },
    ])
    const objectExists = async (key) => ({ exists: key.endsWith('ok.pdf'), size: null })

    const inventory = await collectProviderInventory({
      provider: 'r2',
      deps: { client, objectExists, ownsClient: false },
    })

    expect(inventory.report.counts).toMatchObject({
      manifestRows: 2,
      ok: 1,
      manifestWithoutObject: 1,
      objectsWithoutManifest: 0,
    })
  })

  test('collectProviderInventory rechaza un provider no-r2 en vivo (sin deps)', async () => {
    // Sin deps inyectadas el sondeo usaría r2ObjectExists; un provider != r2
    // cotejaría keys contra el backend equivocado → debe cortar ANTES de tocar
    // DB/red, no misclasificar.
    await expect(collectProviderInventory({ provider: 'netlify-blobs' })).rejects.toThrow(
      /solo se puede sondear el provider 'r2'/i,
    )
  })

  test('summarizeOrphans nunca declara escrituras y lista non-goals', () => {
    const summary = summarizeOrphans(
      {
        provider: 'r2',
        probedCount: 1,
        warnings: [],
        report: {
          counts: {
            manifestRows: 1,
            presentKeys: 0,
            manifestWithoutObject: 1,
            objectsWithoutManifest: 0,
            ok: 0,
          },
          manifestWithoutObject: [
            {
              provider: 'r2',
              domain: 'library-uploads',
              sanitizedKey: 'user-1/…#deadbeef',
            },
          ],
          objectsWithoutManifest: [],
        },
      },
      { generatedAt: '2026-06-22T00:00:00.000Z' },
    )
    expect(summary.writesPerformed).toBe(false)
    expect(summary.nonGoals).toContain('no delete object')
  })

  test('formatOrphansMarkdown imprime un reporte read-only con la categoría (a)', () => {
    const summary = summarizeOrphans(
      {
        provider: 'r2',
        probedCount: 1,
        warnings: [],
        report: {
          counts: {
            manifestRows: 1,
            presentKeys: 0,
            manifestWithoutObject: 1,
            objectsWithoutManifest: 0,
            ok: 0,
          },
          manifestWithoutObject: [
            {
              provider: 'r2',
              domain: 'library-uploads',
              sanitizedKey: 'user-1/…#deadbeef',
            },
          ],
          objectsWithoutManifest: [],
        },
      },
      { generatedAt: '2026-06-22T00:00:00.000Z' },
    )
    const md = formatOrphansMarkdown(summary)
    expect(md).toContain('# Storage Orphans Inventory')
    expect(md).toContain('Escrituras realizadas: **no**')
    expect(md).toContain('`user-1/…#deadbeef`')
    expect(md).toContain('no delete object')

    const json = JSON.parse(formatOrphansJson(summary))
    expect(json.writesPerformed).toBe(false)
  })

  test('parseArgs default a markdown y respeta flags', () => {
    expect(parseArgs([])).toMatchObject({ markdown: true, json: false, provider: 'r2' })
    expect(parseArgs(['--json'])).toMatchObject({ json: true, markdown: false })
    expect(parseArgs(['--provider=netlify-blobs'])).toMatchObject({
      provider: 'netlify-blobs',
    })
    expect(parseArgs(['--max-probes=10'])).toMatchObject({ maxProbes: 10 })
    expect(() => parseArgs(['--nope'])).toThrow('Argumento no reconocido')
  })
})
