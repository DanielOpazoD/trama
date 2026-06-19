#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const SYNTHETIC_ID = '00000000-0000-4000-8000-000000000247'

export const RUNTIME_API_ROUTES = [
  {
    domain: 'entities',
    functionFile: 'netlify/functions/entities.mts',
    helperFile: 'netlify/functions/_lib/entities-endpoint.ts',
    publicPaths: ['/api/entities', '/api/entities/:id', '/api/entities/:id/restore'],
    nativeFunctionPath: '/.netlify/functions/entities',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    auth: 'required',
    cleanupPath: '/api/entities/:id',
    live: {
      collectionPath: '/api/entities',
      collectionExpectedStatus: 200,
      cleanupProbes: [
        { method: 'DELETE', path: '/api/entities/:id', expectedStatus: 404 },
        {
          method: 'POST',
          path: '/api/entities/:id/restore',
          expectedStatus: 404,
          data: { deletedAt: new Date(0).toISOString() },
        },
      ],
    },
    reason: 'core graph isolation and cutover smoke fixture cleanup',
  },
  {
    domain: 'recortes',
    functionFile: 'netlify/functions/recortes.mts',
    helperFile: 'netlify/functions/_lib/recortes-endpoint.ts',
    publicPaths: [
      '/api/recortes',
      '/api/recortes/:id',
      '/api/recortes/:id/promote',
      '/api/recortes/:id/unpromote',
      '/api/recortes/:id/restore',
      '/api/recortes/:id/suggest',
    ],
    nativeFunctionPath: '/.netlify/functions/recortes',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    auth: 'required',
    cleanupPath: '/api/recortes/:id',
    live: {
      collectionPath: '/api/recortes',
      collectionExpectedStatus: 200,
      cleanupProbes: [
        { method: 'DELETE', path: '/api/recortes/:id', expectedStatus: 404 },
        {
          method: 'POST',
          path: '/api/recortes/:id/restore',
          expectedStatus: 404,
          data: { deletedAt: new Date(0).toISOString() },
        },
      ],
    },
    reason: 'private capture inbox and extension write surface',
  },
  {
    domain: 'momentos',
    functionFile: 'netlify/functions/momentos.mts',
    helperFile: 'netlify/functions/_lib/momentos-endpoint.ts',
    publicPaths: ['/api/momentos', '/api/momentos/:id'],
    nativeFunctionPath: '/.netlify/functions/momentos',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    auth: 'required',
    cleanupPath: '/api/momentos/:id',
    live: {
      collectionPath: '/api/momentos?limit=1',
      collectionExpectedStatus: 200,
      cleanupProbes: [
        { method: 'DELETE', path: '/api/momentos/:id', expectedStatus: 404 },
      ],
    },
    reason: 'private timeline surface with shared-space exceptions',
  },
  {
    domain: 'search',
    functionFile: 'netlify/functions/search.mts',
    helperFile: 'netlify/functions/_lib/search-endpoint.ts',
    publicPaths: ['/api/search'],
    nativeFunctionPath: '/.netlify/functions/search',
    methods: ['GET'],
    auth: 'required',
    cleanupPath: null,
    live: {
      collectionPath: '/api/search?q=runtime-route-preflight',
      collectionExpectedStatus: 200,
      cleanupProbes: [],
    },
    reason: 'cross-domain private retrieval surface',
  },
  {
    domain: 'notes',
    functionFile: 'netlify/functions/notes.mts',
    helperFile: null,
    publicPaths: ['/api/notes', '/api/notes/:id', '/api/notes/:id/restore'],
    nativeFunctionPath: '/.netlify/functions/notes',
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    auth: 'required',
    cleanupPath: '/api/notes/:id',
    live: {
      collectionPath: '/api/notes?limit=1',
      collectionExpectedStatus: 200,
      cleanupProbes: [{ method: 'DELETE', path: '/api/notes/:id', expectedStatus: 404 }],
    },
    reason: 'private writing surface used as a known-good routing baseline',
  },
  {
    domain: 'notas-feed',
    functionFile: 'netlify/functions/notas-feed.mts',
    helperFile: null,
    publicPaths: ['/api/notas-feed'],
    nativeFunctionPath: '/.netlify/functions/notas-feed',
    methods: ['GET'],
    auth: 'required',
    cleanupPath: null,
    live: {
      collectionPath: '/api/notas-feed?segment=todo&limit=1',
      collectionExpectedStatus: 200,
      cleanupProbes: [],
    },
    reason: 'composed private feed surface where leaks are highly visible',
  },
  {
    domain: 'notas-attachments',
    functionFile: 'netlify/functions/notas-attachments.mts',
    helperFile: null,
    publicPaths: ['/api/notas-attachments', '/api/notas-attachments/:id'],
    nativeFunctionPath: '/.netlify/functions/notas-attachments',
    methods: ['GET', 'DELETE'],
    auth: 'required',
    cleanupPath: '/api/notas-attachments/:id',
    live: {
      collectionPath: `/api/notas-attachments?ownerType=note&ownerId=${SYNTHETIC_ID}`,
      collectionExpectedStatus: 404,
      cleanupProbes: [
        { method: 'DELETE', path: '/api/notas-attachments/:id', expectedStatus: 404 },
      ],
    },
    reason: 'private attachment metadata and blob authorization surface',
  },
  {
    domain: 'notas-attachments-upload',
    functionFile: 'netlify/functions/notas-attachments-upload.mts',
    helperFile: null,
    publicPaths: ['/api/notas-attachments-upload'],
    nativeFunctionPath: '/.netlify/functions/notas-attachments-upload',
    methods: ['POST'],
    auth: 'required',
    cleanupPath: null,
    live: null,
    reason: 'private attachment write surface that creates blob-backed fixtures',
  },
]

function sourceAt(root, relativePath) {
  return readFileSync(join(root, relativePath), 'utf8')
}

function formatIssue(route, message) {
  return {
    domain: route.domain,
    functionFile: route.functionFile,
    message,
  }
}

export function validateRuntimeApiRouteContracts({
  root = process.cwd(),
  routes = RUNTIME_API_ROUTES,
} = {}) {
  const issues = []

  for (const route of routes) {
    const functionSource = sourceAt(root, route.functionFile)

    if (!functionSource.includes('export const config')) {
      issues.push(
        formatIssue(route, 'function file must declare export const config locally'),
      )
    }

    if (/export\s+\{\s*config\s*\}/.test(functionSource)) {
      issues.push(formatIssue(route, 'function file must not re-export config'))
    }

    if (functionSource.includes('import handler, { config }')) {
      issues.push(formatIssue(route, 'function file must not import config from helper'))
    }

    for (const publicPath of route.publicPaths) {
      if (!functionSource.includes(`'${publicPath}'`)) {
        issues.push(formatIssue(route, `function file is missing route ${publicPath}`))
      }
    }

    if (route.helperFile) {
      const helperSource = sourceAt(root, route.helperFile)
      if (helperSource.includes('export const config')) {
        issues.push(formatIssue(route, 'helper file must not export Netlify config'))
      }
    }
  }

  return {
    ok: issues.length === 0,
    routes,
    issues,
  }
}

export function formatRuntimeApiRouteReport(result) {
  const lines = ['runtime_api_routes: ' + (result.ok ? 'ok' : 'failed'), '']

  for (const route of result.routes) {
    lines.push(
      `- ${route.domain}: ${route.publicPaths.join(', ')} -> ${route.functionFile}`,
    )
  }

  if (!result.ok) {
    lines.push('', 'Issues:')
    for (const issue of result.issues) {
      lines.push(`- ${issue.functionFile}: ${issue.message}`)
    }
  }

  return `${lines.join('\n')}\n`
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/$/, '')
}

function concreteProbePath(path) {
  return path.replaceAll(':id', SYNTHETIC_ID)
}

function authHeaders(token) {
  return token ? { authorization: `Bearer ${token}` } : {}
}

async function readProbeResponse(response) {
  const body = await response.text().catch(() => '')
  const contentType = response.headers.get('content-type') ?? ''
  return {
    status: response.status,
    contentType,
    body,
  }
}

function buildProbeFailure(probe, observed, reason) {
  return {
    label: probe.label,
    method: probe.method,
    path: probe.path,
    expectedStatuses: probe.expectedStatuses,
    status: observed.status,
    contentType: observed.contentType,
    reason,
    bodyPreview: observed.body.slice(0, 180),
  }
}

async function runLiveProbe({ baseUrl, fetchImpl, probe }) {
  const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}${probe.path}`, {
    method: probe.method,
    headers: {
      ...authHeaders(probe.token),
      ...(probe.data ? { 'content-type': 'application/json' } : {}),
    },
    body: probe.data ? JSON.stringify(probe.data) : undefined,
  })
  const observed = await readProbeResponse(response)
  const failures = []

  if (!observed.contentType.includes('application/json')) {
    failures.push(buildProbeFailure(probe, observed, 'expected JSON API response'))
  }

  if (/<!doctype html|<html/i.test(observed.body)) {
    failures.push(buildProbeFailure(probe, observed, 'received SPA/html fallback'))
  }

  if (!probe.expectedStatuses.includes(observed.status)) {
    failures.push(
      buildProbeFailure(
        probe,
        observed,
        `expected status ${probe.expectedStatuses.join(' or ')}`,
      ),
    )
  }

  return {
    ...probe,
    status: observed.status,
    contentType: observed.contentType,
    ok: failures.length === 0,
    failures,
  }
}

export function buildRuntimeApiLiveProbes({
  routes = RUNTIME_API_ROUTES,
  tokenA,
  tokenB,
} = {}) {
  const probes = []

  for (const route of routes) {
    if (!route.live) continue

    probes.push({
      label: `${route.domain}: anonymous collection`,
      method: 'GET',
      path: route.live.collectionPath,
      token: null,
      expectedStatuses: [401],
    })

    probes.push({
      label: `${route.domain}: user A collection`,
      method: 'GET',
      path: route.live.collectionPath,
      token: tokenA,
      expectedStatuses: [route.live.collectionExpectedStatus],
    })

    if (tokenB) {
      probes.push({
        label: `${route.domain}: user B collection`,
        method: 'GET',
        path: route.live.collectionPath,
        token: tokenB,
        expectedStatuses: [route.live.collectionExpectedStatus],
      })
    }

    for (const cleanupProbe of route.live.cleanupProbes) {
      probes.push({
        label: `${route.domain}: cleanup route ${cleanupProbe.method}`,
        method: cleanupProbe.method,
        path: concreteProbePath(cleanupProbe.path),
        token: tokenA,
        data: cleanupProbe.data,
        expectedStatuses: [cleanupProbe.expectedStatus],
      })
    }
  }

  return probes
}

export async function probeRuntimeApiRoutes({
  baseUrl,
  tokenA,
  tokenB,
  fetchImpl = fetch,
  routes = RUNTIME_API_ROUTES,
} = {}) {
  if (!baseUrl || !tokenA) {
    throw new Error(
      'runtime route probe requires E2E_BASE_URL and E2E_USER_A_TOKEN. E2E_USER_B_TOKEN is recommended.',
    )
  }

  const probes = buildRuntimeApiLiveProbes({ routes, tokenA, tokenB })
  const results = []
  const failures = []

  for (const probe of probes) {
    const result = await runLiveProbe({ baseUrl, fetchImpl, probe })
    results.push(result)
    failures.push(...result.failures)
  }

  return {
    ok: failures.length === 0,
    baseUrl: normalizeBaseUrl(baseUrl),
    results,
    failures,
  }
}

export function formatRuntimeApiProbeReport(result) {
  const lines = ['runtime_api_route_probe: ' + (result.ok ? 'ok' : 'failed'), '']

  for (const probe of result.results) {
    lines.push(
      `- ${probe.ok ? 'ok' : 'fail'} ${probe.method} ${probe.path} -> ${probe.status}`,
    )
  }

  if (!result.ok) {
    lines.push('', 'Failures:')
    for (const failure of result.failures) {
      lines.push(
        `- ${failure.label}: ${failure.reason} (${failure.status}, ${failure.contentType || 'no content-type'}) ${failure.method} ${failure.path}`,
      )
    }
  }

  return `${lines.join('\n')}\n`
}

export function runRuntimeApiRouteCheck({ argv = process.argv.slice(2), root } = {}) {
  const result = validateRuntimeApiRouteContracts({ root })

  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } else {
    process.stdout.write(formatRuntimeApiRouteReport(result))
  }

  return result.ok ? 0 : 1
}

export async function runRuntimeApiRouteProbeCli({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const baseUrl = env.E2E_BASE_URL
  const tokenA = env.E2E_USER_A_TOKEN
  const tokenB = env.E2E_USER_B_TOKEN
  try {
    const result = await probeRuntimeApiRoutes({ baseUrl, tokenA, tokenB })
    if (argv.includes('--json')) {
      stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    } else {
      stdout.write(formatRuntimeApiProbeReport(result))
    }
    return result.ok ? 0 : 1
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2)
  if (argv.includes('--probe')) {
    process.exit(await runRuntimeApiRouteProbeCli({ argv }))
  }
  process.exit(runRuntimeApiRouteCheck({ argv }))
}
