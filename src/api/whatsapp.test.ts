import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.hoisted(() => vi.fn())

vi.mock('./request', () => ({
  request: requestMock,
}))

import { whatsappApi } from './whatsapp'

beforeEach(() => {
  requestMock.mockReset()
})

describe('whatsappApi client contract', () => {
  it('lista vínculos transformando snake_case a camelCase', async () => {
    requestMock.mockResolvedValueOnce([
      {
        id: 'wa-1',
        phone_e164: '+56912345678',
        label: 'Daniel',
        verified_at: '2026-06-20T10:00:00.000Z',
        last_message_at: '2026-06-21T10:00:00.000Z',
        created_at: '2026-06-19T10:00:00.000Z',
      },
    ])

    await expect(whatsappApi.listWhatsAppLinks()).resolves.toEqual([
      {
        id: 'wa-1',
        phone: '+56912345678',
        label: 'Daniel',
        verifiedAt: '2026-06-20T10:00:00.000Z',
        lastMessageAt: '2026-06-21T10:00:00.000Z',
        createdAt: '2026-06-19T10:00:00.000Z',
      },
    ])
    expect(requestMock).toHaveBeenCalledWith('/api/whatsapp-link')
  })

  it('crea código de vinculación omitiendo body cuando no hay label', async () => {
    requestMock.mockResolvedValueOnce({
      id: 'code-1',
      code: 'ABC123',
      expiresAt: '2026-06-20T10:05:00.000Z',
      ttlMinutes: 5,
    })

    await whatsappApi.createWhatsAppLinkCode()

    expect(requestMock).toHaveBeenCalledWith('/api/whatsapp-link', {
      method: 'POST',
      body: JSON.stringify({}),
    })
  })

  it('usa rutas privadas codificadas para remover links y leer métricas', async () => {
    requestMock.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({
      days: 7,
      total: 0,
      ok: 0,
      failed: 0,
      byKind: [],
      byEvent: [],
      daily: [],
      recent: [],
    })

    await whatsappApi.removeWhatsAppLink('link/id con espacios')
    await whatsappApi.getWhatsAppMetrics(7)

    expect(requestMock.mock.calls).toEqual([
      ['/api/whatsapp-link/link%2Fid%20con%20espacios', { method: 'DELETE' }],
      ['/api/whatsapp-metrics?days=7'],
    ])
  })
})
