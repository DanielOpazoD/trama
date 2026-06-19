import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, test } from 'vitest'

import {
  formatOperationalObservabilityReport,
  validateOperationalObservabilityContracts,
} from './operational-observability-contracts.mjs'

function writeFixture(root, files) {
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, content)
  }
}

describe('operational observability contracts', () => {
  test('el repo actual mantiene eventos, docs, scripts e integración runtime', () => {
    const result = validateOperationalObservabilityContracts()

    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
    expect(formatOperationalObservabilityReport(result)).toContain(
      'operational_observability_contracts: ok',
    )
  })

  test('detecta drift si falta un evento o documentación del smoke productivo', () => {
    const root = join(tmpdir(), `trama-ops-contract-${Date.now()}`)
    writeFixture(root, {
      'package.json': JSON.stringify({
        scripts: {
          'smoke:production-report': 'node scripts/multiuser-production-report.mjs',
          'check:operational-observability':
            'node scripts/operational-observability-contracts.mjs',
        },
      }),
      '.github/workflows/test.yml':
        'Operational observability contracts\nnpm run check:operational-observability\n',
      'netlify/functions/_lib/operational-events.ts':
        "export const operationalEventNames = ['auth.denied'] as const\n",
      'netlify/functions/_lib/auth.ts':
        "import { logOperationalEvent } from './operational-events'\nlogOperationalEvent({event: 'auth.verified'})\n",
      'netlify/functions/_lib/handler-wrap.ts':
        "import { logOperationalEvent } from './operational-events'\nlogOperationalEvent({event: 'auth.denied'})\n",
      'netlify/functions/health.mts':
        "productionSmokeCommand: 'npm run smoke:production-report'\nruntimeApiRoutesContract: 'check:runtime-api-routes'\n",
      'docs/observability.md': 'auth.denied\n',
      'docs/runbook-multiusuario.md': 'npm run cutover:smoke\n',
    })

    const result = validateOperationalObservabilityContracts({ root })

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'netlify/functions/_lib/operational-events.ts',
          message: expect.stringContaining('auth.fallback'),
        }),
        expect.objectContaining({
          file: 'docs/runbook-multiusuario.md',
          message: expect.stringContaining('smoke:production-report'),
        }),
      ]),
    )
  })
})
