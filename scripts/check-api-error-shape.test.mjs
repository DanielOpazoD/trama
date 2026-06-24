import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { checkApiErrorShape, collectHandRolledErrors } from './check-api-error-shape.mjs'

async function makeRepo() {
  const root = await mkdtemp(join(tmpdir(), 'trama-api-error-'))
  mkdirSync(join(root, 'netlify/functions'), { recursive: true })
  function write(relPath, source) {
    const file = join(root, 'netlify/functions', relPath)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, source)
  }
  return { root, write }
}

describe('collectHandRolledErrors (detección)', () => {
  it('marca new Response con status literal 4xx en el init', async () => {
    const { root, write } = await makeRepo()
    write('h.mts', `export default () => new Response('Not found', { status: 404 })`)
    const out = collectHandRolledErrors(root)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ file: 'netlify/functions/h.mts', status: 404 })
  })

  it('marca Response.json con status 5xx', async () => {
    const { root, write } = await makeRepo()
    write('h.mts', `export default () => Response.json({ msg: 'boom' }, { status: 500 })`)
    expect(collectHandRolledErrors(root)).toHaveLength(1)
  })

  it('NO se evade con key quoted ni espacios flexibles antes del colon', async () => {
    const { root, write } = await makeRepo()
    write(
      'q1.mts',
      `export const a = () => Response.json({ ok: false }, { "status": 500 })`,
    )
    write('q2.mts', `export const b = () => new Response('e', { 'status': 404 })`)
    write('sp.mts', `export const c = () => new Response('e', { status : 503 })`)
    expect(collectHandRolledErrors(root)).toHaveLength(3)
  })

  it('NO marca status < 400 (200 implícito, 204, 302 redirect, json 200)', async () => {
    const { root, write } = await makeRepo()
    write('ok.mts', `export const a = () => new Response(blob, { headers })`)
    write(
      'redir.mts',
      `export const b = () => new Response(null, { status: 302, headers })`,
    )
    write('nc.mts', `export const c = () => new Response(null, { status: 204 })`)
    write('json.mts', `export const d = () => Response.json({ url }, { status: 200 })`)
    expect(collectHandRolledErrors(root)).toHaveLength(0)
  })

  it('NO marca status DINÁMICO (reenviadores tipo handler-wrap/ssrf)', async () => {
    const { root, write } = await makeRepo()
    write(
      'wrap.mts',
      `export const a = () => new Response(res.body, { status: res.statusCode, statusText })`,
    )
    expect(collectHandRolledErrors(root)).toHaveLength(0)
  })

  it('mira el INIT, no el cuerpo: body {status:404} con init 200 NO cuenta', async () => {
    const { root, write } = await makeRepo()
    write(
      'h.mts',
      `export const a = () => new Response(JSON.stringify({ status: 404 }), { status: 200 })`,
    )
    expect(collectHandRolledErrors(root)).toHaveLength(0)
  })

  it('ignora ejemplos en comentarios (// y /* */) y no rompe con https://', async () => {
    const { root, write } = await makeRepo()
    write(
      'h.mts',
      [
        `// ejemplo viejo: new Response('x', { status: 400 })`,
        `/* tampoco: new Response('y', { status: 500 }) */`,
        `export const url = 'https://api.example.com'`,
        `export const ok = () => new Response(null, { status: 204 })`,
      ].join('\n'),
    )
    expect(collectHandRolledErrors(root)).toHaveLength(0)
  })

  it('reporta la línea correcta del call multilínea', async () => {
    const { root, write } = await makeRepo()
    write(
      'h.mts',
      [
        'export const a = () =>',
        '  new Response(body, {',
        '    status: 503,',
        '  })',
      ].join('\n'),
    )
    const out = collectHandRolledErrors(root)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ line: 2, status: 503 })
  })

  it('excluye *.test.ts', async () => {
    const { root, write } = await makeRepo()
    write('real.mts', `export const a = () => new Response('e', { status: 404 })`)
    write('real.test.ts', `it('x', () => new Response('e', { status: 404 }))`)
    expect(collectHandRolledErrors(root).map((e) => e.file)).toEqual([
      'netlify/functions/real.mts',
    ])
  })
})

describe('checkApiErrorShape (ratchet)', () => {
  const noAllow = new Map()

  it('FALLA si supera el baseline', async () => {
    const { root, write } = await makeRepo()
    write('h.mts', `export const a = () => new Response('e', { status: 404 })`)
    const r = checkApiErrorShape({ root, baseline: 0, allowlist: noAllow })
    expect(r.ok).toBe(false)
    expect(r.failures).toContainEqual({ kind: 'increase', actual: 1, baseline: 0 })
  })

  it('PASA en el baseline y avisa (dropped) por debajo', async () => {
    const { root, write } = await makeRepo()
    write('h.mts', `export const a = () => new Response('e', { status: 404 })`)
    expect(checkApiErrorShape({ root, baseline: 1, allowlist: noAllow }).ok).toBe(true)
    expect(checkApiErrorShape({ root, baseline: 2, allowlist: noAllow }).dropped).toBe(
      true,
    )
  })

  it('el allowlist por archivo exime al constructor canónico', async () => {
    const { root, write } = await makeRepo()
    write(
      '_lib/api-error.ts',
      `export const e = () => new Response('e', { status: 400 })`,
    )
    const allowlist = new Map([['netlify/functions/_lib/api-error.ts', 'canónico']])
    const r = checkApiErrorShape({ root, baseline: 0, allowlist })
    expect(r.ok).toBe(true)
    expect(r.count).toBe(0)
    expect(r.allowlisted).toHaveLength(1)
  })
})
