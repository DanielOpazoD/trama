#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const REQUIRED_OPERATIONAL_EVENTS = [
  'auth.denied',
  'auth.fallback',
  'auth.verified',
  'blob.access.denied',
  'mutation.created',
  'mutation.deleted',
  'owner.mismatch',
  'smoke.failed',
  'smoke.passed',
]

const REQUIRED_DOC_SNIPPETS = [
  {
    file: 'docs/observability.md',
    snippets: [
      'Eventos operacionales multiusuario',
      'auth.denied',
      'auth.fallback',
      'owner.mismatch',
      'smoke.passed',
      'smoke.failed',
      'npm run smoke:production-report',
    ],
  },
  {
    file: 'docs/runbook-multiusuario.md',
    snippets: [
      'Smoke productivo reportable',
      'npm run smoke:production-report',
      'production_smoke: ok',
      'runtime_api_route_probe: ok',
    ],
  },
  {
    file: 'docs/adr/0011-multiuser-operational-observability.md',
    snippets: [
      'Multiuser Operational Observability',
      'smoke:production-report',
      'auth.denied',
      'auth.fallback',
      'No adoptamos OpenTelemetry',
    ],
  },
  {
    file: 'docs/incidentes-multiusuario.md',
    snippets: [
      'Incidentes Multiusuario',
      'Usuario A ve datos de B',
      'production_smoke: ok',
      'owner.mismatch',
      'ALLOW_LEGACY_FALLBACK',
    ],
  },
]

const REQUIRED_AUTH_CONTEXTS = [
  {
    file: 'netlify/functions/health.mts',
    operation: 'health.read',
  },
  {
    file: 'netlify/functions/notes.mts',
    operation: 'notes.${req.method.toLowerCase()}',
  },
  {
    file: 'netlify/functions/notas-feed.mts',
    operation: 'notas-feed.read',
  },
  {
    file: 'netlify/functions/_lib/search-endpoint.ts',
    operation: 'search.read',
  },
  {
    file: 'netlify/functions/_lib/recortes-endpoint.ts',
    operation: 'recortes.${req.method.toLowerCase()}',
  },
  {
    file: 'netlify/functions/_lib/momentos-endpoint.ts',
    operation: 'momentos.${req.method.toLowerCase()}',
  },
]

function read(root, file) {
  return readFileSync(join(root, file), 'utf8')
}

function tryRead(root, file, failures) {
  try {
    return read(root, file)
  } catch {
    failures.push({ file, message: 'required contract file is missing' })
    return ''
  }
}

function addMissingSnippetFailures(failures, root, file, snippets) {
  const source = tryRead(root, file, failures)
  for (const snippet of snippets) {
    if (!source.includes(snippet)) {
      failures.push({ file, message: `missing required snippet: ${snippet}` })
    }
  }
}

export function validateOperationalObservabilityContracts({ root = process.cwd() } = {}) {
  const failures = []

  const pkg = JSON.parse(tryRead(root, 'package.json', failures) || '{}')
  if (
    pkg.scripts?.['smoke:production-report'] !==
    'node scripts/multiuser-production-report.mjs'
  ) {
    failures.push({
      file: 'package.json',
      message: 'missing smoke:production-report script',
    })
  }
  if (
    pkg.scripts?.['check:operational-observability'] !==
    'node scripts/operational-observability-contracts.mjs'
  ) {
    failures.push({
      file: 'package.json',
      message: 'missing check:operational-observability script',
    })
  }

  const workflow = tryRead(root, '.github/workflows/test.yml', failures)
  if (!workflow.includes('Operational observability contracts')) {
    failures.push({
      file: '.github/workflows/test.yml',
      message: 'CI must name the operational observability gate',
    })
  }
  if (!workflow.includes('npm run check:operational-observability')) {
    failures.push({
      file: '.github/workflows/test.yml',
      message: 'CI must run check:operational-observability',
    })
  }

  const eventsSource = tryRead(
    root,
    'netlify/functions/_lib/operational-events.ts',
    failures,
  )
  for (const event of REQUIRED_OPERATIONAL_EVENTS) {
    if (!eventsSource.includes(`'${event}'`)) {
      failures.push({
        file: 'netlify/functions/_lib/operational-events.ts',
        message: `missing operational event: ${event}`,
      })
    }
  }

  const authSource = tryRead(root, 'netlify/functions/_lib/auth.ts', failures)
  if (!authSource.includes('logOperationalEvent')) {
    failures.push({
      file: 'netlify/functions/_lib/auth.ts',
      message: 'auth must emit operational events for verified/fallback paths',
    })
  }
  for (const event of ['auth.verified', 'auth.fallback']) {
    if (!authSource.includes(event)) {
      failures.push({
        file: 'netlify/functions/_lib/auth.ts',
        message: `auth must emit ${event}`,
      })
    }
  }

  const wrapperSource = tryRead(root, 'netlify/functions/_lib/handler-wrap.ts', failures)
  if (!wrapperSource.includes('auth.denied')) {
    failures.push({
      file: 'netlify/functions/_lib/handler-wrap.ts',
      message: 'handler wrapper must emit auth.denied for unauthenticated requests',
    })
  }

  const healthSource = tryRead(root, 'netlify/functions/health.mts', failures)
  for (const snippet of [
    "productionSmokeCommand: 'npm run smoke:production-report'",
    "runtimeApiRoutesContract: 'check:runtime-api-routes'",
    "logRedaction: 'structured-redaction'",
  ]) {
    if (!healthSource.includes(snippet)) {
      failures.push({
        file: 'netlify/functions/health.mts',
        message: `health operational block missing ${snippet}`,
      })
    }
  }

  for (const context of REQUIRED_AUTH_CONTEXTS) {
    const source = tryRead(root, context.file, failures)
    if (!source.includes('getAuthedUser(req, {')) {
      failures.push({
        file: context.file,
        message: 'high-risk private surface must pass operational auth context',
      })
    }
    if (!source.includes('requestId')) {
      failures.push({
        file: context.file,
        message: 'operational auth context must include requestId',
      })
    }
    if (!source.includes(context.operation)) {
      failures.push({
        file: context.file,
        message: `operational auth context must include operation ${context.operation}`,
      })
    }
  }

  for (const doc of REQUIRED_DOC_SNIPPETS) {
    addMissingSnippetFailures(failures, root, doc.file, doc.snippets)
  }

  return { ok: failures.length === 0, failures }
}

export function formatOperationalObservabilityReport(result) {
  const lines = [`operational_observability_contracts: ${result.ok ? 'ok' : 'failed'}`]
  for (const failure of result.failures) {
    lines.push(`- ${failure.file}: ${failure.message}`)
  }
  return `${lines.join('\n')}\n`
}

export function runOperationalObservabilityContractsCli({
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const result = validateOperationalObservabilityContracts()
  const report = formatOperationalObservabilityReport(result)
  ;(result.ok ? stdout : stderr).write(report)
  return result.ok ? 0 : 1
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(runOperationalObservabilityContractsCli())
}
