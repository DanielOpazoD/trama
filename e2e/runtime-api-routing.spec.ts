import {
  type APIRequestContext,
  type APIResponse,
  expect,
  request,
  test,
} from '@playwright/test'

const REQUIRED_ENV = ['E2E_BASE_URL', 'E2E_USER_A_TOKEN', 'E2E_USER_B_TOKEN'] as const
const SYNTHETIC_ID = '00000000-0000-4000-8000-000000000247'

const HIGH_RISK_PATH_LITERALS = [
  '/api/entities',
  '/api/entities/:id',
  '/api/entities/:id/restore',
  '/api/recortes',
  '/api/recortes/:id',
  '/api/recortes/:id/promote',
  '/api/recortes/:id/unpromote',
  '/api/recortes/:id/restore',
  '/api/recortes/:id/suggest',
  '/api/momentos',
  '/api/momentos/:id',
  '/api/search',
] as const

type Probe = {
  label: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  path: string
  expectedStatuses: number[]
  data?: Record<string, unknown>
}

function hasRuntimeRoutingEnv(): boolean {
  return REQUIRED_ENV.every((key) => Boolean(process.env[key]))
}

function concretePath(path: string): string {
  return path.replaceAll(':id', SYNTHETIC_ID)
}

async function expectJsonApiResponse(
  response: APIResponse,
  label: string,
  expectedStatuses: number[],
) {
  const body = await response.text()
  const contentType = response.headers()['content-type'] ?? ''

  expect(
    contentType,
    `${label}: API routes must return JSON, not the SPA/html fallback. status=${response.status()} body=${body.slice(0, 180)}`,
  ).toContain('application/json')
  expect(body, `${label}: response should not be the SPA document`).not.toMatch(
    /<!doctype html|<html/i,
  )
  expect(
    expectedStatuses,
    `${label}: unexpected status ${response.status()} body=${body.slice(0, 220)}`,
  ).toContain(response.status())
}

async function runProbe(ctx: APIRequestContext, probe: Probe) {
  const response = await ctx.fetch(probe.path, {
    method: probe.method,
    data: probe.data,
  })
  await expectJsonApiResponse(response, probe.label, probe.expectedStatuses)
}

test.describe('runtime API routing contract', () => {
  test.skip(
    !hasRuntimeRoutingEnv(),
    'requires E2E_BASE_URL, E2E_USER_A_TOKEN and E2E_USER_B_TOKEN',
  )

  test('private API collection routes are mounted as JSON routes', async () => {
    const anon = await request.newContext({
      baseURL: process.env.E2E_BASE_URL!,
    })
    const userA = await request.newContext({
      baseURL: process.env.E2E_BASE_URL!,
      extraHTTPHeaders: { Authorization: `Bearer ${process.env.E2E_USER_A_TOKEN!}` },
    })

    const authedCollectionProbes: Probe[] = [
      {
        label: 'entities collection',
        method: 'GET',
        path: '/api/entities?limit=1',
        expectedStatuses: [200],
      },
      {
        label: 'recortes collection',
        method: 'GET',
        path: '/api/recortes?limit=1',
        expectedStatuses: [200],
      },
      {
        label: 'momentos collection',
        method: 'GET',
        path: '/api/momentos?limit=1',
        expectedStatuses: [200],
      },
      {
        label: 'search collection',
        method: 'GET',
        path: '/api/search?q=runtime-route-preflight',
        expectedStatuses: [200],
      },
      {
        label: 'notes collection baseline',
        method: 'GET',
        path: '/api/notes?limit=1',
        expectedStatuses: [200],
      },
      {
        label: 'notas feed baseline',
        method: 'GET',
        path: '/api/notas-feed?segment=todo&limit=1',
        expectedStatuses: [200],
      },
      {
        label: 'attachment owner lookup baseline',
        method: 'GET',
        path: `/api/notas-attachments?ownerType=note&ownerId=${SYNTHETIC_ID}`,
        expectedStatuses: [404],
      },
    ]

    const anonymousProbes: Probe[] = [
      {
        label: 'anon entities',
        method: 'GET',
        path: '/api/entities',
        expectedStatuses: [401],
      },
      {
        label: 'anon recortes',
        method: 'GET',
        path: '/api/recortes',
        expectedStatuses: [401],
      },
      {
        label: 'anon momentos',
        method: 'GET',
        path: '/api/momentos',
        expectedStatuses: [401],
      },
      {
        label: 'anon search',
        method: 'GET',
        path: '/api/search?q=runtime-route-preflight',
        expectedStatuses: [401],
      },
    ]

    try {
      for (const probe of anonymousProbes) {
        await runProbe(anon, probe)
      }
      for (const probe of authedCollectionProbes) {
        await runProbe(userA, probe)
      }
    } finally {
      await anon.dispose()
      await userA.dispose()
    }
  })

  test('cleanup and restore routes reach handlers instead of Netlify fallback', async () => {
    const userA = await request.newContext({
      baseURL: process.env.E2E_BASE_URL!,
      extraHTTPHeaders: { Authorization: `Bearer ${process.env.E2E_USER_A_TOKEN!}` },
    })

    const probes: Probe[] = [
      {
        label: 'entities synthetic delete',
        method: 'DELETE',
        path: concretePath('/api/entities/:id'),
        expectedStatuses: [404],
      },
      {
        label: 'entities synthetic restore',
        method: 'POST',
        path: concretePath('/api/entities/:id/restore'),
        data: { deletedAt: new Date(0).toISOString() },
        expectedStatuses: [404],
      },
      {
        label: 'recortes synthetic delete',
        method: 'DELETE',
        path: concretePath('/api/recortes/:id'),
        expectedStatuses: [404],
      },
      {
        label: 'recortes synthetic restore',
        method: 'POST',
        path: concretePath('/api/recortes/:id/restore'),
        data: { deletedAt: new Date(0).toISOString() },
        expectedStatuses: [404],
      },
      {
        label: 'momentos synthetic delete',
        method: 'DELETE',
        path: concretePath('/api/momentos/:id'),
        expectedStatuses: [404],
      },
      {
        label: 'notes synthetic delete baseline',
        method: 'DELETE',
        path: concretePath('/api/notes/:id'),
        expectedStatuses: [404],
      },
      {
        label: 'attachments synthetic delete baseline',
        method: 'DELETE',
        path: concretePath('/api/notas-attachments/:id'),
        expectedStatuses: [404],
      },
    ]

    try {
      for (const probe of probes) {
        await runProbe(userA, probe)
      }
    } finally {
      await userA.dispose()
    }
  })

  test('path literal list stays visible for static route-contract guardrails', () => {
    expect(HIGH_RISK_PATH_LITERALS).toEqual(
      expect.arrayContaining([
        '/api/entities',
        '/api/entities/:id',
        '/api/entities/:id/restore',
        '/api/recortes',
        '/api/recortes/:id',
        '/api/recortes/:id/promote',
        '/api/recortes/:id/unpromote',
        '/api/recortes/:id/restore',
        '/api/recortes/:id/suggest',
        '/api/momentos',
        '/api/momentos/:id',
        '/api/search',
      ]),
    )
  })
})
