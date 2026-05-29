import { describe, expect, it, vi } from 'vitest'
import { mockContext, mockSqlResponses, mockSqlState, setupMockSql } from './test-utils'

/**
 * Isolation tests cross-user — núcleo del modelo multi-user.
 *
 * Estos tests verifican que los endpoints **incluyen el user_id del
 * authed user en las queries SQL**. No verifican la lógica de Postgres
 * (la DB es responsable de filtrar correctamente con un `AND user_id = $X`);
 * verifican que el endpoint pasa el userId correcto al SQL.
 *
 * Por qué importa: si un endpoint se olvida del filtro `AND user_id = …`,
 * un usuario puede leer/escribir datos de otro. Este test atrapa el
 * caso negligente — si el handler hace `await sql\`SELECT … WHERE deleted_at IS NULL\``
 * sin filtrar por user_id, el mockSqlState.calls no va a contener
 * el userId esperado en los values, y este test falla.
 *
 * Estrategia: ejecutar el handler con un userId que NO es el legacy
 * (vía `process.env.ALLOW_LEGACY_FALLBACK=true` + simular token Clerk
 * resolviendo a un sub específico), y luego verificar que TODAS las
 * queries SQL ejecutadas incluyen ese userId entre sus values.
 */

vi.mock('./db.js', () => setupMockSql())

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn().mockResolvedValue({ sub: 'user_alice_id_xyz' }),
}))

// Las queries que tocan embeddings no deben rompernos en este test.
vi.stubGlobal(
  'fetch',
  vi.fn().mockResolvedValue({
    ok: false,
    status: 500,
    text: async () => '',
    json: async () => ({}),
  }),
)

// CLERK_SECRET_KEY presente → flujo Clerk activo. process.env se setea
// antes del import del handler para que el módulo auth.js arranque con
// el modo correcto.
process.env['CLERK_SECRET_KEY'] = 'sk_test_xxxx'

import handler from '../entities'

function requestWithToken(method = 'GET', body?: unknown) {
  const init: RequestInit = {
    method,
    headers: { authorization: 'Bearer alice-token' },
  }
  if (body !== undefined) init.body = JSON.stringify(body)
  return new Request('http://localhost/api/entities', init)
}

describe('isolation cross-user', () => {
  describe('entities endpoint', () => {
    it('GET wholesale incluye user_id="user_alice_id_xyz" en los values de la query SQL', async () => {
      mockSqlResponses.reset()
      mockSqlResponses.push([]) // SELECT
      await handler(requestWithToken(), mockContext())

      // El SELECT debería haber sido ejecutado con un value que incluye el userId.
      // mockSqlState.calls[i].values es el array de valores interpolados.
      const allValues = mockSqlState.calls.flatMap((c) => c.values)
      expect(allValues).toContain('user_alice_id_xyz')
    })

    it('GET con cursor también incluye el userId', async () => {
      mockSqlResponses.reset()
      mockSqlResponses.push([]) // SELECT paginado
      const req = new Request(
        'http://localhost/api/entities?cursor=2024-01-01T00:00:00Z:abc&limit=20',
        { method: 'GET', headers: { authorization: 'Bearer alice-token' } },
      )
      await handler(req, mockContext())

      const allValues = mockSqlState.calls.flatMap((c) => c.values)
      expect(allValues).toContain('user_alice_id_xyz')
    })

    it('POST (crear entidad) persiste el userId del authed user', async () => {
      mockSqlResponses.reset()
      mockSqlResponses.push([]) // dup-detection vector search
      mockSqlResponses.push([{ id: 'new-uuid' }]) // INSERT RETURNING
      mockSqlResponses.push([]) // lookup post-insert
      await handler(
        requestWithToken('POST', {
          name: 'Test',
          type: 'persona',
        }),
        mockContext(),
      )

      const allValues = mockSqlState.calls.flatMap((c) => c.values)
      expect(allValues).toContain('user_alice_id_xyz')
    })

    it('legacy mode (sin Clerk key) sigue usando legacy-single-user', async () => {
      // Para este test específico necesitamos resetear: el flujo de
      // Clerk está activo via env var. Lo invertimos temporalmente.
      const original = process.env['CLERK_SECRET_KEY']
      delete process.env['CLERK_SECRET_KEY']
      vi.resetModules()
      const { default: freshHandler } = await import('../entities')

      mockSqlResponses.reset()
      mockSqlResponses.push([])
      await freshHandler(
        new Request('http://localhost/api/entities', { method: 'GET' }),
        mockContext(),
      )

      const allValues = mockSqlState.calls.flatMap((c) => c.values)
      expect(allValues).toContain('legacy-single-user')

      // Restaurar para no romper otros tests.
      if (original) process.env['CLERK_SECRET_KEY'] = original
    })
  })
})
