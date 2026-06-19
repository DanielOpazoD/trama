import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { describe, expect, test } from 'vitest'

const ROOT = process.cwd()

const HIGH_RISK_RUNTIME_ROUTES = [
  {
    functionFile: 'entities.mts',
    helperFile: '_lib/entities-endpoint.ts',
    paths: ['/api/entities', '/api/entities/:id', '/api/entities/:id/restore'],
    reason: 'core graph isolation and cutover smoke fixture cleanup',
  },
  {
    functionFile: 'recortes.mts',
    helperFile: '_lib/recortes-endpoint.ts',
    paths: [
      '/api/recortes',
      '/api/recortes/:id',
      '/api/recortes/:id/promote',
      '/api/recortes/:id/unpromote',
      '/api/recortes/:id/restore',
      '/api/recortes/:id/suggest',
    ],
    reason: 'private capture inbox and extension write surface',
  },
  {
    functionFile: 'momentos.mts',
    helperFile: '_lib/momentos-endpoint.ts',
    paths: ['/api/momentos', '/api/momentos/:id'],
    reason: 'private timeline surface with shared-space exceptions',
  },
  {
    functionFile: 'search.mts',
    helperFile: '_lib/search-endpoint.ts',
    paths: ['/api/search'],
    reason: 'cross-domain private retrieval surface',
  },
]

function jsonProbeResponse(status, body = { ok: true }) {
  return {
    status,
    headers: { get: () => 'application/json; charset=utf-8' },
    text: async () => JSON.stringify(body),
  }
}

function htmlProbeResponse(status) {
  return {
    status,
    headers: { get: () => 'text/html' },
    text: async () => '<!doctype html><div id="root"></div>',
  }
}

function readFunctionSource(relativePath) {
  return readFileSync(join(ROOT, 'netlify/functions', relativePath), 'utf8')
}

describe('runtime API route contracts', () => {
  test('package exposes a CI-friendly runtime route check', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

    expect(pkg.scripts['check:runtime-api-routes']).toBe(
      'node scripts/runtime-api-routes.mjs',
    )
  })

  test('runtime route checker emits a JSON manifest for reviewers', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/runtime-api-routes.mjs', '--json'],
      {
        cwd: ROOT,
        encoding: 'utf8',
      },
    )

    expect(result.status, result.stderr).toBe(0)
    const manifest = JSON.parse(result.stdout)
    expect(manifest.ok).toBe(true)
    expect(manifest.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          functionFile: 'netlify/functions/entities.mts',
          publicPaths: [
            '/api/entities',
            '/api/entities/:id',
            '/api/entities/:id/restore',
          ],
          nativeFunctionPath: '/.netlify/functions/entities',
          auth: 'required',
          cleanupPath: '/api/entities/:id',
        }),
        expect.objectContaining({
          functionFile: 'netlify/functions/recortes.mts',
          publicPaths: expect.arrayContaining(['/api/recortes', '/api/recortes/:id']),
          nativeFunctionPath: '/.netlify/functions/recortes',
          auth: 'required',
          cleanupPath: '/api/recortes/:id',
        }),
        expect.objectContaining({
          functionFile: 'netlify/functions/momentos.mts',
          publicPaths: ['/api/momentos', '/api/momentos/:id'],
          nativeFunctionPath: '/.netlify/functions/momentos',
          auth: 'required',
          cleanupPath: '/api/momentos/:id',
        }),
        expect.objectContaining({
          functionFile: 'netlify/functions/search.mts',
          publicPaths: ['/api/search'],
          nativeFunctionPath: '/.netlify/functions/search',
          auth: 'required',
          cleanupPath: null,
        }),
      ]),
    )
  })

  test('live route probe validates JSON API responses without Playwright', async () => {
    const { formatRuntimeApiProbeReport, probeRuntimeApiRoutes } =
      await import('./runtime-api-routes.mjs')
    const calls = []
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, init })
      const isAuthed = Boolean(init.headers?.authorization)
      const status = isAuthed ? (url.includes(SYNTHETIC_ID) ? 404 : 200) : 401

      return jsonProbeResponse(status)
    }

    const result = await probeRuntimeApiRoutes({
      baseUrl: 'https://trama.example/',
      tokenA: 'token-a',
      tokenB: 'token-b',
      fetchImpl,
    })

    expect(result.ok).toBe(true)
    expect(result.failures).toEqual([])
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: 'https://trama.example/api/entities',
          init: expect.objectContaining({ method: 'GET' }),
        }),
        expect.objectContaining({
          url: `https://trama.example/api/entities/${SYNTHETIC_ID}`,
          init: expect.objectContaining({
            method: 'DELETE',
            headers: expect.objectContaining({ authorization: 'Bearer token-a' }),
          }),
        }),
        expect.objectContaining({
          url: 'https://trama.example/api/search?q=runtime-route-preflight',
          init: expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({ authorization: 'Bearer token-a' }),
          }),
        }),
      ]),
    )
    expect(formatRuntimeApiProbeReport(result)).toContain('runtime_api_route_probe: ok')
    expect(formatRuntimeApiProbeReport(result)).toContain('/api/entities')
  })

  test('live route probe fails on SPA HTML fallback even when status is expected', async () => {
    const { probeRuntimeApiRoutes } = await import('./runtime-api-routes.mjs')
    const result = await probeRuntimeApiRoutes({
      baseUrl: 'https://trama.example',
      tokenA: 'token-a',
      tokenB: 'token-b',
      fetchImpl: async () => htmlProbeResponse(401),
    })

    expect(result.ok).toBe(false)
    expect(result.failures[0]?.reason).toContain('expected JSON')
  })

  test('runtime E2E preflight covers the high-risk public API routes', () => {
    const specSource = readFileSync(join(ROOT, 'e2e/runtime-api-routing.spec.ts'), 'utf8')

    for (const route of HIGH_RISK_RUNTIME_ROUTES) {
      for (const path of route.paths) {
        expect(specSource).toContain(`'${path}'`)
      }
    }
  })

  test('multiuser runbook documents the runtime route contract', () => {
    const runbook = readFileSync(join(ROOT, 'docs/runbook-multiusuario.md'), 'utf8')

    expect(runbook).toContain('Contrato runtime de rutas API')
    expect(runbook).toContain('npm run check:runtime-api-routes')
    expect(runbook).toContain('e2e/runtime-api-routing.spec.ts')
    expect(runbook).toContain('/api/* nunca debe devolver el HTML de la SPA')
  })

  test.each(HIGH_RISK_RUNTIME_ROUTES)(
    '$functionFile declares config.path locally for $reason',
    ({ functionFile, helperFile, paths }) => {
      const functionSource = readFunctionSource(functionFile)
      const helperSource = readFunctionSource(helperFile)

      expect(functionSource).toContain('export const config')
      expect(functionSource).not.toMatch(/export\s+\{\s*config\s*\}/)
      expect(functionSource).not.toContain('import handler, { config }')

      for (const path of paths) {
        expect(functionSource).toContain(`'${path}'`)
      }

      expect(helperSource).not.toContain('export const config')
    },
  )
})

const SYNTHETIC_ID = '00000000-0000-4000-8000-000000000247'
