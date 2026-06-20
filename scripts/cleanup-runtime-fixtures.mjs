#!/usr/bin/env node
import { pathToFileURL } from 'node:url'

export const KNOWN_RUNTIME_FIXTURES = [
  {
    domain: 'recortes',
    id: '407fa20a-dfd6-4d53-aff7-1e9794aa586f',
    path: '/api/recortes/:id',
    reason: 'route-probe recorte created before /api/:id cleanup was verified',
  },
  {
    domain: 'momentos',
    id: '3243d6da-fc2a-41f3-ad7a-f2b8b8c4d326',
    path: '/api/momentos/:id',
    reason: 'route-probe momento created before /api/:id cleanup was verified',
  },
]

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/$/, '')
}

function fixtureUrl(baseUrl, fixture) {
  return `${normalizeBaseUrl(baseUrl)}${fixture.path.replace(':id', fixture.id)}`
}

function authHeaders(token) {
  return token ? { authorization: `Bearer ${token}` } : {}
}

async function cleanupFixture({ baseUrl, token, fixture, fetchImpl }) {
  const response = await fetchImpl(fixtureUrl(baseUrl, fixture), {
    method: 'DELETE',
    headers: authHeaders(token),
  })
  const body = await response.text().catch(() => '')
  const ok = [200, 204, 404].includes(response.status)

  return {
    ...fixture,
    ok,
    status: response.status,
    bodyPreview: body.slice(0, 180),
  }
}

export async function cleanupRuntimeFixtures({
  baseUrl,
  token,
  fixtures = KNOWN_RUNTIME_FIXTURES,
  fetchImpl = fetch,
} = {}) {
  if (!baseUrl || !token) {
    throw new Error('runtime fixture cleanup requires E2E_BASE_URL and E2E_USER_A_TOKEN.')
  }

  const results = []
  for (const fixture of fixtures) {
    results.push(await cleanupFixture({ baseUrl, token, fixture, fetchImpl }))
  }

  return {
    ok: results.every((result) => result.ok),
    baseUrl: normalizeBaseUrl(baseUrl),
    results,
    failures: results.filter((result) => !result.ok),
  }
}

export function formatCleanupReport(result) {
  const lines = ['runtime_fixture_cleanup: ' + (result.ok ? 'ok' : 'failed'), '']

  for (const item of result.results) {
    lines.push(`- ${item.ok ? 'ok' : 'fail'} ${item.domain} ${item.id} -> ${item.status}`)
  }

  if (!result.ok) {
    lines.push('', 'Failures:')
    for (const failure of result.failures) {
      lines.push(
        `- ${failure.domain} ${failure.id}: status ${failure.status} ${failure.bodyPreview}`,
      )
    }
  }

  return `${lines.join('\n')}\n`
}

export async function runCleanupRuntimeFixturesCli({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  try {
    const result = await cleanupRuntimeFixtures({
      baseUrl: env.E2E_BASE_URL,
      token: env.E2E_USER_A_TOKEN,
    })
    if (argv.includes('--json')) {
      stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } else {
      stdout.write(formatCleanupReport(result))
    }
    return result.ok ? 0 : 1
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await runCleanupRuntimeFixturesCli())
}
