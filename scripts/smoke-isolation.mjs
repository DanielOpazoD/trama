#!/usr/bin/env node
/**
 * Smoke test de AISLAMIENTO multi-usuario contra un deploy real.
 *
 * Es el paso de verificación previo al cutover (docs/runbook-multiusuario.md):
 * con dos usuarios Clerk reales (A y B) comprueba que nada de lo que crea A es
 * visible para B, y que sin token la API responde 401 (es decir, que
 * ALLOW_LEGACY_FALLBACK quedó apagado).
 *
 * Uso:
 *   SMOKE_BASE_URL=https://<deploy>.netlify.app \
 *   SMOKE_TOKEN_A=<jwt clerk usuario A> \
 *   SMOKE_TOKEN_B=<jwt clerk usuario B> \
 *   node scripts/smoke-isolation.mjs
 *
 * Los JWT se consiguen desde la app logueada (DevTools → request a /api/* →
 * header Authorization) o con el template de sesión de Clerk. Duran poco:
 * generar y correr de inmediato.
 *
 * El script crea fixtures con prefijo "[smoke-isolation]" y las soft-borra al
 * final (best-effort). Sale con código 1 si CUALQUIER verificación falla.
 */

const BASE = process.env.SMOKE_BASE_URL?.replace(/\/$/, '')
const TOKEN_A = process.env.SMOKE_TOKEN_A
const TOKEN_B = process.env.SMOKE_TOKEN_B

if (!BASE || !TOKEN_A || !TOKEN_B) {
  console.error(
    'Faltan variables: SMOKE_BASE_URL, SMOKE_TOKEN_A y SMOKE_TOKEN_B son obligatorias.',
  )
  process.exit(2)
}

let failures = 0
const cleanups = []

function ok(label) {
  console.log(`  ✓ ${label}`)
}
function fail(label, detail) {
  failures += 1
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    /* respuestas sin body */
  }
  return { status: res.status, json }
}

function listItems(json) {
  if (Array.isArray(json)) return json
  if (json && Array.isArray(json.items)) return json.items
  return []
}

async function checkDomain({ label, createPath, listPath, body, idOf }) {
  console.log(`\n· ${label}`)
  const created = await api(TOKEN_A, 'POST', createPath, body)
  if (created.status >= 300 || !idOf(created.json)) {
    fail(`A crea en ${createPath}`, `status ${created.status}`)
    return
  }
  const id = idOf(created.json)
  ok(`A creó ${id}`)
  cleanups.push(() => api(TOKEN_A, 'DELETE', `${createPath}/${id}`))

  const listB = await api(TOKEN_B, 'GET', listPath)
  const visible = listItems(listB.json).some((item) => idOf(item) === id)
  if (visible) fail(`B NO debe ver el item de A en ${listPath}`, 'apareció en la lista')
  else ok(`B no lo ve en su lista (${listPath})`)

  const directB = await api(TOKEN_B, 'GET', `${createPath}/${id}`)
  if (directB.status === 404 || directB.status === 403) {
    ok(`B no puede abrirlo directo (status ${directB.status})`)
  } else {
    fail(`B NO debe poder abrir ${createPath}/${id}`, `status ${directB.status}`)
  }

  const listA = await api(TOKEN_A, 'GET', listPath)
  if (listItems(listA.json).some((item) => idOf(item) === id)) {
    ok('A sí lo ve (sanity)')
  } else {
    fail('A debería ver su propio item', 'no apareció — ¿token A inválido?')
  }
}

console.log(`Smoke de aislamiento multi-usuario → ${BASE}`)

// 0 · Sin token la API debe exigir auth (fallback legacy APAGADO).
{
  console.log('\n· Sin token (ALLOW_LEGACY_FALLBACK debe estar off)')
  const anon = await api(null, 'GET', '/api/entities')
  if (anon.status === 401) ok('GET /api/entities sin token → 401')
  else
    fail(
      'GET /api/entities sin token debería dar 401',
      `status ${anon.status} — ¿ALLOW_LEGACY_FALLBACK sigue en true?`,
    )
}

// 1 · Entidades (dominio core de Trama).
await checkDomain({
  label: 'Entidades',
  createPath: '/api/entities',
  listPath: '/api/entities',
  body: { name: '[smoke-isolation] entidad', type: 'concepto' },
  idOf: (row) => row?.id,
})

// 2 · Notas (mundo Notas).
await checkDomain({
  label: 'Notas',
  createPath: '/api/notes',
  listPath: '/api/notes',
  body: { content: '[smoke-isolation] nota de prueba' },
  idOf: (row) => row?.id,
})

// 3 · Momentos (incluye el camino de espacio compartido: B sin invitación no ve nada).
await checkDomain({
  label: 'Momentos',
  createPath: '/api/momentos',
  listPath: '/api/momentos',
  body: {
    kind: 'nota',
    payload: { bodyText: '[smoke-isolation] momento' },
  },
  idOf: (row) => row?.id,
})

// Limpieza best-effort de las fixtures de A.
console.log('\n· Limpieza')
for (const cleanup of cleanups) {
  try {
    await cleanup()
  } catch {
    /* best-effort */
  }
}
ok(`${cleanups.length} fixtures soft-borradas`)

if (failures > 0) {
  console.error(`\n✗ ${failures} verificación(es) FALLARON — NO hacer el cutover.`)
  process.exit(1)
}
console.log(
  '\n✓ Aislamiento verificado: cada usuario ve solo lo suyo y la API exige token.',
)
