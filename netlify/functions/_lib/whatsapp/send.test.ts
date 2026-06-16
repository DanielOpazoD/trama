import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendWhatsAppContent } from './send'

vi.mock('../observability.js', () => ({ logEvent: vi.fn() }))

afterEach(() => vi.unstubAllGlobals())

const base = {
  accountSid: 'AC123',
  authToken: 'tok',
  from: 'whatsapp:+14155238886',
  to: 'whatsapp:+56912345678',
  contentSid: 'HXabc',
  contentVariables: JSON.stringify({ '1': 'hola' }),
}

describe('sendWhatsAppContent', () => {
  it('postea al endpoint Messages con auth básica y form-encoded', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201 })
    vi.stubGlobal('fetch', fetchMock)

    const ok = await sendWhatsAppContent(base)

    expect(ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('AC123:tok').toString('base64')}`,
    )
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    const body = new URLSearchParams(init.body)
    expect(body.get('From')).toBe('whatsapp:+14155238886')
    expect(body.get('To')).toBe('whatsapp:+56912345678')
    expect(body.get('ContentSid')).toBe('HXabc')
    expect(body.get('ContentVariables')).toBe(JSON.stringify({ '1': 'hola' }))
  })

  it('respuesta no-2xx → false (el caller cae a TwiML)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad' }),
    )
    expect(await sendWhatsAppContent(base)).toBe(false)
  })

  it('error de red → false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')))
    expect(await sendWhatsAppContent(base)).toBe(false)
  })
})
