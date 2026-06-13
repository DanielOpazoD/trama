import { describe, expect, it } from 'vitest'
import { expectedTwilioSignature, validateTwilioSignature } from './twilio-signature'

/**
 * Vector canónico del algoritmo documentado por Twilio (URL + params POST
 * ordenados, HMAC-SHA1 base64 con el Auth Token).
 */
const TOKEN = '12345'
const URL_ = 'https://mycompany.com/myapp.php?foo=1&bar=2'
const PARAMS = {
  CallSid: 'CA1234567890ABCDE',
  Caller: '+14158675310',
  Digits: '1234',
  From: '+14158675310',
  To: '+18005551212',
}
const SIG = 'GvWf1cFY/Q7PnoempGyD5oXAezc='

describe('twilio-signature', () => {
  it('reproduce la firma esperada (orden de params estable)', () => {
    expect(expectedTwilioSignature(TOKEN, URL_, PARAMS)).toBe(SIG)
  })

  it('valida una firma correcta', () => {
    expect(
      validateTwilioSignature({
        authToken: TOKEN,
        url: URL_,
        params: PARAMS,
        signature: SIG,
      }),
    ).toBe(true)
  })

  it('rechaza si cambia un parámetro', () => {
    expect(
      validateTwilioSignature({
        authToken: TOKEN,
        url: URL_,
        params: { ...PARAMS, Digits: '9999' },
        signature: SIG,
      }),
    ).toBe(false)
  })

  it('rechaza firma ausente o de otro largo', () => {
    expect(
      validateTwilioSignature({
        authToken: TOKEN,
        url: URL_,
        params: PARAMS,
        signature: null,
      }),
    ).toBe(false)
    expect(
      validateTwilioSignature({
        authToken: TOKEN,
        url: URL_,
        params: PARAMS,
        signature: 'corta',
      }),
    ).toBe(false)
  })

  it('rechaza con otro auth token', () => {
    expect(
      validateTwilioSignature({
        authToken: 'otro',
        url: URL_,
        params: PARAMS,
        signature: SIG,
      }),
    ).toBe(false)
  })
})
