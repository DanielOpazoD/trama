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
    [
      'Faltan variables obligatorias para el smoke multiusuario:',
      !BASE ? '  - SMOKE_BASE_URL=https://<deploy>.netlify.app' : null,
      !TOKEN_A ? '  - SMOKE_TOKEN_A=<jwt usuario A>' : null,
      !TOKEN_B ? '  - SMOKE_TOKEN_B=<jwt usuario B>' : null,
      'Opcional: SMOKE_REVOKED_TOKEN=<jwt de una sesión ya revocada>.',
      'También puedes usar npm run smoke:multiuser:prod con esas variables.',
    ]
      .filter(Boolean)
      .join('\n'),
  )
  process.exit(2)
}

let failures = 0
const cleanups = []
const summary = {
  anonymous_401: 'pending',
  revoked_401: REVOKED_TOKEN ? 'pending' : 'skipped',
  read_isolation: 'pending',
  mutation_isolation: 'pending',
  blob_isolation: 'pending',
}
const categoryFailures = {
  read_isolation: 0,
  mutation_isolation: 0,
  blob_isolation: 0,
}

function ok(label) {
  console.log(`  ✓ ${label}`)
}
function fail(label, detail, category) {
  failures += 1
  if (category) categoryFailures[category] += 1
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

function jsonContains(json, marker) {
  return JSON.stringify(json).includes(marker)
}

async function expectBDoesNotContain(label, path, marker) {
  const res = await api(TOKEN_B, 'GET', path)
  if (res.status !== 200) {
    fail(
      `${label}: B debería poder consultar ${path}`,
      `status ${res.status}`,
      'read_isolation',
    )
    return
  }
  if (jsonContains(res.json, marker)) {
    fail(
      `${label}: B NO debe ver fixture de A en ${path}`,
      'apareció el marker',
      'read_isolation',
    )
    return
  }
  ok(`${label}: B no ve el marker en ${path}`)
}

async function expectAStillContains(
  label,
  path,
  marker,
  category = 'mutation_isolation',
) {
  const res = await api(TOKEN_A, 'GET', path)
  if (res.status !== 200) {
    fail(`${label}: A debería poder consultar ${path}`, `status ${res.status}`, category)
    return
  }
  if (!jsonContains(res.json, marker)) {
    fail(
      `${label}: fixture de A debería seguir intacta`,
      `no aparece en ${path}`,
      category,
    )
    return
  }
  ok(`${label}: intento de B no afectó la fixture de A`)
}

async function expectBMutationDoesNotAffectA({
  label,
  path,
  patchBody,
  verifyPath,
  marker,
}) {
  if (patchBody) {
    const patched = await api(TOKEN_B, 'PATCH', path, patchBody)
    if (patched.status === 403 || patched.status === 404) {
      ok(`${label}: B no puede editar item de A (status ${patched.status})`)
    } else {
      fail(
        `${label}: B NO debe editar item de A`,
        `status ${patched.status}`,
        'mutation_isolation',
      )
    }
  }

  const deleted = await api(TOKEN_B, 'DELETE', path)
  if (deleted.status === 403 || deleted.status === 404) {
    ok(`${label}: B no puede borrar item de A (status ${deleted.status})`)
  } else if (deleted.status >= 200 && deleted.status < 300) {
    ok(`${label}: DELETE de B no tocó filas de A (status ${deleted.status})`)
  } else {
    fail(
      `${label}: DELETE de B falló de forma inesperada`,
      `status ${deleted.status}`,
      'mutation_isolation',
    )
  }
  await expectAStillContains(label, verifyPath, marker)
}

async function createA(path, body, label) {
  const created = await api(TOKEN_A, 'POST', path, body)
  if (created.status >= 300 || !created.json?.id) {
    fail(`A crea ${label}`, `status ${created.status}`, 'read_isolation')
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
  if (anon.status === 401) {
    summary.anonymous_401 = 'ok'
    ok('GET /api/entities sin token → 401')
  } else {
    summary.anonymous_401 = 'failed'
    fail(
      'GET /api/entities sin token debería dar 401',
      `status ${anon.status} — ¿ALLOW_LEGACY_FALLBACK sigue en true?`,
    )
  }
}

if (REVOKED_TOKEN) {
  console.log('\n· Token revocado')
  const revoked = await api(REVOKED_TOKEN, 'GET', '/api/entities')
  if (revoked.status === 401) {
    summary.revoked_401 = 'ok'
    ok('GET /api/entities con token revocado → 401')
  } else {
    summary.revoked_401 = 'failed'
    fail('Token revocado debería dar 401', `status ${revoked.status}`)
  }
}

// 1 · Entidades (dominio core de Trama).
{
  console.log('\n· Entidades')
  const marker = `[smoke-isolation] entidad ${Date.now()}`
  const entity = await createA(
    '/api/entities',
    { name: marker, type: 'concepto' },
    'entidad',
  )
  if (entity) {
    cleanups.push(() => api(TOKEN_A, 'DELETE', `/api/entities/${entity.id}`))
    await expectBDoesNotContain('Entidades', '/api/entities', marker)
    const directB = await api(TOKEN_B, 'GET', `/api/entities/${entity.id}`)
    if (directB.status === 404 || directB.status === 403) {
      ok(`B no puede abrir entidad directo (status ${directB.status})`)
    } else {
      fail(
        `B NO debe poder abrir /api/entities/${entity.id}`,
        `status ${directB.status}`,
        'read_isolation',
      )
    }
    await expectBMutationDoesNotAffectA({
      label: 'Entidades',
      path: `/api/entities/${entity.id}`,
      patchBody: { name: `${marker} mutada por B` },
      verifyPath: '/api/entities',
      marker,
    })
  }
}

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
      await expectBMutationDoesNotAffectA({
        label: 'Citas',
        path: `/api/quotes/${quote.id}`,
        patchBody: { text: `${marker} mutada por B` },
        verifyPath: '/api/quotes?limit=50',
        marker,
      })
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
        fail(
          'B NO debe listar anexos de nota de A',
          `status ${listB.status}`,
          'blob_isolation',
        )
      }

      const fileB = await api(
        TOKEN_B,
        'GET',
        `/api/notas-attachments-file/${encodeURIComponent(attachment.json.storage_key)}`,
      )
      if (fileB.status === 403 || fileB.status === 404) {
        ok(`B no puede descargar blob de A (status ${fileB.status})`)
      } else {
        fail('B NO debe descargar blob de A', `status ${fileB.status}`, 'blob_isolation')
      }

      await expectBMutationDoesNotAffectA({
        label: 'Notas',
        path: `/api/notes/${note.id}`,
        patchBody: { content: `${marker} mutada por B` },
        verifyPath: `/api/notes?q=${encodeURIComponent(marker)}`,
        marker,
      })

      const deletedByB = await api(
        TOKEN_B,
        'DELETE',
        `/api/notas-attachments/${attachment.json.id}`,
      )
      if (deletedByB.status === 403 || deletedByB.status === 404) {
        ok(`B no puede borrar anexo de A (status ${deletedByB.status})`)
      } else if (deletedByB.status >= 200 && deletedByB.status < 300) {
        ok(`DELETE de B no tocó anexo de A (status ${deletedByB.status})`)
      } else {
        fail(
          'DELETE de B sobre anexo falló de forma inesperada',
          `status ${deletedByB.status}`,
          'blob_isolation',
        )
      }
      const listA = await api(
        TOKEN_A,
        'GET',
        `/api/notas-attachments?ownerType=note&ownerId=${encodeURIComponent(note.id)}`,
      )
      if (jsonContains(listA.json, attachment.json.id)) {
        ok('Anexo de A sigue listado tras intento de B')
      } else {
        fail(
          'Anexo de A debería seguir listado tras intento de B',
          null,
          'blob_isolation',
        )
      }
    }
  }
}

// 4 · Momentos (incluye el camino de espacio compartido: B sin invitación no ve nada).
{
  console.log('\n· Momentos')
  const marker = `[smoke-isolation] momento ${Date.now()}`
  const momento = await createA(
    '/api/momentos',
    {
      kind: 'nota',
      payload: { bodyText: marker },
    },
    'momento',
  )
  if (momento) {
    cleanups.push(() => api(TOKEN_A, 'DELETE', `/api/momentos/${momento.id}`))
    await expectBDoesNotContain('Momentos', '/api/momentos', marker)
    const directB = await api(TOKEN_B, 'GET', `/api/momentos/${momento.id}`)
    if (directB.status === 404 || directB.status === 403) {
      ok(`B no puede abrir momento directo (status ${directB.status})`)
    } else {
      fail(
        `B NO debe poder abrir /api/momentos/${momento.id}`,
        `status ${directB.status}`,
        'read_isolation',
      )
    }
    await expectBMutationDoesNotAffectA({
      label: 'Momentos',
      path: `/api/momentos/${momento.id}`,
      patchBody: { payload: { bodyText: `${marker} mutado por B` } },
      verifyPath: '/api/momentos',
      marker,
    })
  }
}

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

summary.read_isolation = categoryFailures.read_isolation > 0 ? 'failed' : 'ok'
summary.mutation_isolation = categoryFailures.mutation_isolation > 0 ? 'failed' : 'ok'
summary.blob_isolation = categoryFailures.blob_isolation > 0 ? 'failed' : 'ok'

console.log('\n· Resumen')
for (const [key, value] of Object.entries(summary)) {
  console.log(`${key}: ${value}`)
}

if (failures > 0) {
  console.error(`\n✗ ${failures} verificación(es) FALLARON — NO hacer el cutover.`)
  process.exit(1)
}
console.log(
  '\n✓ Aislamiento verificado: cada usuario ve solo lo suyo y la API exige token.',
)
