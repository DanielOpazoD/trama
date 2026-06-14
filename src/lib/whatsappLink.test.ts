import { describe, expect, it } from 'vitest'
import { buildWhatsAppDeepLink } from './whatsappLink'

describe('buildWhatsAppDeepLink', () => {
  it('arma el wa.me con dígitos puros y texto pre-cargado', () => {
    expect(buildWhatsAppDeepLink('+1 415 523 8886', 'ABC234')).toBe(
      'https://wa.me/14155238886?text=vincular%20ABC234',
    )
  })

  it('limpia cualquier separador del número', () => {
    expect(buildWhatsAppDeepLink('whatsapp:+56-9-1234-5678', 'XY99ZZ')).toBe(
      'https://wa.me/56912345678?text=vincular%20XY99ZZ',
    )
  })

  it('null si no hay número configurado', () => {
    expect(buildWhatsAppDeepLink('', 'ABC234')).toBeNull()
    expect(buildWhatsAppDeepLink(null, 'ABC234')).toBeNull()
    expect(buildWhatsAppDeepLink(undefined, 'ABC234')).toBeNull()
  })
})
