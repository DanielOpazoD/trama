#!/usr/bin/env node
/* global File, FormData */
/**
 * Smoke test de AISLAMIENTO multi-usuario contra un deploy real.
 *
 * Es el paso de verificación previo al cutover (docs/runbook-multiusuario.md):
 * con dos usuarios Clerk reales (A y B) comprueba que nada de lo que crea A es
 * visible para B, y que sin token la API responde 401 (es decir, que
 * ALLOW_LEGACY_FALLBACK quedó apagado). Si se entrega SMOKE_REVOKED_TOKEN,
 * también comprueba que un token revocado ya no accede.
 *
 * Uso:
 *   SMOKE_BASE_URL=https://<deploy>.netlify.app \
 *   SMOKE_TOKEN_A=<jwt clerk usuario A> \
 *   SMOKE_TOKEN_B=<jwt clerk usuario B> \
 *   SMOKE_REVOKED_TOKEN=<jwt revocado opcional> \
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
const REVOKED_TOKEN = process.env.SMOKE_REVOKED_TOKEN

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

async function apiMultipart(token, path, fields) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, value)
  }
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: form,
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

function jsonContains(json, marker) {
  return JSON.stringify(json).includes(marker)
}

async function expectBDoesNotContain(label, path, marker) {
  const res = await api(TOKEN_B, 'GET', path)
  if (res.status !== 200) {
    fail(`${label}: B debería poder consultar ${path}`, `status ${res.status}`)
    return
  }
  if (jsonContains(res.json, marker)) {
    fail(`${label}: B NO debe ver fixture de A en ${path}`, 'apareció el marker')
    return
  }
  ok(`${label}: B no ve el marker en ${path}`)
}

async function checkDomain({ label, createPath, listPath, body, idOf, direct = true }) {
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

  if (direct) {
    const directB = await api(TOKEN_B, 'GET', `${createPath}/${id}`)
    if (directB.status === 404 || directB.status === 403) {
      ok(`B no puede abrirlo directo (status ${directB.status})`)
    } else {
      fail(`B NO debe poder abrir ${createPath}/${id}`, `status ${directB.status}`)
    }
  }

  const listA = await api(TOKEN_A, 'GET', listPath)
  if (listItems(listA.json).some((item) => idOf(item) === id)) {
    ok('A sí lo ve (sanity)')
  } else {
    fail('A debería ver su propio item', 'no apareció — ¿token A inválido?')
  }
}

async function createA(path, body, label) {
  const created = await api(TOKEN_A, 'POST', path, body)
  if (created.status >= 300 || !created.json?.id) {
    fail(`A crea ${label}`, `status ${created.status}`)
    return null
  }
  ok(`A creó ${label} ${created.json.id}`)
  return created.json
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

if (REVOKED_TOKEN) {
  console.log('\n· Token revocado')
  const revoked = await api(REVOKED_TOKEN, 'GET', '/api/entities')
  if (revoked.status === 401) ok('GET /api/entities con token revocado → 401')
  else fail('Token revocado debería dar 401', `status ${revoked.status}`)
}

// 1 · Entidades (dominio core de Trama).
await checkDomain({
  label: 'Entidades',
  createPath: '/api/entities',
  listPath: '/api/entities',
  body: { name: '[smoke-isolation] entidad', type: 'concepto' },
  idOf: (row) => row?.id,
})

// 2 · Citas (requiere entidad propia; B no debe verla por lista ni búsqueda).
{
  console.log('\n· Citas')
  const marker = `[smoke-isolation] cita ${Date.now()}`
  const entity = await createA(
    '/api/entities',
    { name: `${marker} entidad`, type: 'concepto' },
    'entidad soporte',
  )
  if (entity) {
    cleanups.push(() => api(TOKEN_A, 'DELETE', `/api/entities/${entity.id}`))
    const quote = await createA(
      '/api/quotes',
      { entity_id: entity.id, text: marker, origin: { kind: 'manual' } },
      'cita',
    )
    if (quote) {
      cleanups.push(() => api(TOKEN_A, 'DELETE', `/api/quotes/${quote.id}`))
      await expectBDoesNotContain('Citas', '/api/quotes?limit=50', marker)
      await expectBDoesNotContain(
        'Búsqueda',
        `/api/search?q=${encodeURIComponent(marker)}`,
        marker,
      )
    }
  }
}

// 3 · Notas + Notas feed + Blob attachments.
{
  console.log('\n· Notas, feed y anexos')
  const marker = `[smoke-isolation] nota ${Date.now()}`
  const note = await createA('/api/notes', { title: marker, content: marker }, 'nota')
  if (note) {
    cleanups.push(() => api(TOKEN_A, 'DELETE', `/api/notes/${note.id}`))
    await expectBDoesNotContain(
      'Notas',
      `/api/notes?q=${encodeURIComponent(marker)}`,
      marker,
    )
    await expectBDoesNotContain(
      'Notas feed',
      `/api/notas-feed?segment=todo&q=${encodeURIComponent(marker)}&limit=20`,
      marker,
    )

    const file = new File([marker], `${marker.replace(/[^a-z0-9-]/gi, '-')}.txt`, {
      type: 'text/plain',
    })
    const attachment = await apiMultipart(TOKEN_A, '/api/notas-attachments-upload', {
      ownerType: 'note',
      ownerId: note.id,
      encrypted: '0',
      file,
    })
    if (attachment.status >= 300 || !attachment.json?.id) {
      fail('A sube anexo a nota', `status ${attachment.status}`)
    } else {
      ok(`A subió anexo ${attachment.json.id}`)
      cleanups.push(() =>
        api(TOKEN_A, 'DELETE', `/api/notas-attachments/${attachment.json.id}`),
      )

      const listB = await api(
        TOKEN_B,
        'GET',
        `/api/notas-attachments?ownerType=note&ownerId=${encodeURIComponent(note.id)}`,
      )
      if (listB.status === 403 || listB.status === 404) {
        ok(`B no puede listar anexos de nota de A (status ${listB.status})`)
      } else {
        fail('B NO debe listar anexos de nota de A', `status ${listB.status}`)
      }

      const fileB = await api(
        TOKEN_B,
        'GET',
        `/api/notas-attachments-file/${encodeURIComponent(attachment.json.storage_key)}`,
      )
      if (fileB.status === 403 || fileB.status === 404) {
        ok(`B no puede descargar blob de A (status ${fileB.status})`)
      } else {
        fail('B NO debe descargar blob de A', `status ${fileB.status}`)
      }
    }
  }
}

// 4 · Momentos (incluye el camino de espacio compartido: B sin invitación no ve nada).
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
