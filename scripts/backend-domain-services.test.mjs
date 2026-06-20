import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

describe('backend domain services contract', () => {
  it('exposes the backend domain services check in package scripts and CI', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
    const workflow = readFileSync(join(ROOT, '.github/workflows/test.yml'), 'utf8')

    expect(pkg.scripts['check:backend-domain-services']).toBe(
      'node scripts/backend-domain-services.mjs',
    )
    expect(workflow).toContain('Backend domain services contract')
    expect(workflow).toContain('npm run check:backend-domain-services')
  })

  it('emits a JSON inventory with each endpoint-service boundary', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/backend-domain-services.mjs', '--json'],
      {
        cwd: ROOT,
        encoding: 'utf8',
      },
    )

    expect(result.status, result.stderr).toBe(0)
    const inventory = JSON.parse(result.stdout)

    expect(inventory.ok).toBe(true)
    expect(inventory.contracts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endpoint: 'netlify/functions/_lib/recortes-endpoint.ts',
          service: 'netlify/functions/_lib/recortes-service.ts',
          ok: true,
        }),
        expect.objectContaining({
          endpoint: 'netlify/functions/_lib/momentos-endpoint.ts',
          service: 'netlify/functions/_lib/momentos-service.ts',
          ok: true,
        }),
        expect.objectContaining({
          endpoint: 'netlify/functions/_lib/search-endpoint.ts',
          service: 'netlify/functions/_lib/search-service.ts',
          ok: true,
        }),
        expect.objectContaining({
          endpoint: 'netlify/functions/whatsapp-webhook.mts',
          service: 'netlify/functions/_lib/whatsapp/webhook-replies.ts',
          ok: true,
        }),
      ]),
    )
  })

  it('fails loudly if a handler stops delegating to its service', async () => {
    const { checkBackendDomainServices } = await import('./backend-domain-services.mjs')
    const result = checkBackendDomainServices({
      readFile: (file) => {
        if (file.endsWith('search-endpoint.ts')) return 'export default handler'
        if (file.endsWith('search-service.ts'))
          return 'export function buildSearchResponse() {}'
        return ''
      },
      contracts: [
        {
          endpoint: 'netlify/functions/_lib/search-endpoint.ts',
          service: 'netlify/functions/_lib/search-service.ts',
          endpointRequires: ['buildSearchResponse'],
          serviceRequires: ['buildSearchResponse'],
          endpointMaxLines: 400,
        },
      ],
    })

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'netlify/functions/_lib/search-endpoint.ts',
          message: expect.stringContaining('buildSearchResponse'),
        }),
      ]),
    )
  })
})
