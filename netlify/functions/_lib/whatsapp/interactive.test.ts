import { describe, expect, it } from 'vitest'
import {
  readInteractiveConfig,
  pickCaptureContentSid,
  captureContentVariables,
} from './interactive'

describe('readInteractiveConfig', () => {
  it('lee los ContentSid de las env vars (reader inyectado)', () => {
    const env: Record<string, string> = {
      TWILIO_CONTENT_SID_CAPTURE: 'HXcap',
      TWILIO_CONTENT_SID_CAPTURE_DESTINO: 'HXdest',
    }
    expect(readInteractiveConfig((k) => env[k])).toEqual({
      captureSid: 'HXcap',
      destinoSid: 'HXdest',
    })
  })

  it('ausentes → null (los botones quedan apagados, cae a TwiML)', () => {
    expect(readInteractiveConfig(() => undefined)).toEqual({
      captureSid: null,
      destinoSid: null,
    })
  })
})

describe('pickCaptureContentSid', () => {
  const both = { captureSid: 'HXcap', destinoSid: 'HXdest' }

  it('ambiguo → plantilla con botones de destino', () => {
    expect(pickCaptureContentSid(both, true)).toBe('HXdest')
  })

  it('no ambiguo → plantilla de solo Deshacer', () => {
    expect(pickCaptureContentSid(both, false)).toBe('HXcap')
  })

  it('ambiguo sin destino → cae a la de Deshacer', () => {
    expect(pickCaptureContentSid({ captureSid: 'HXcap', destinoSid: null }, true)).toBe(
      'HXcap',
    )
  })

  it('no ambiguo sin captura → null (no usa la de destino para algo explícito)', () => {
    expect(
      pickCaptureContentSid({ captureSid: null, destinoSid: 'HXdest' }, false),
    ).toBeNull()
  })

  it('sin ninguna plantilla → null', () => {
    expect(pickCaptureContentSid({ captureSid: null, destinoSid: null }, true)).toBeNull()
  })
})

describe('captureContentVariables', () => {
  it('mapea el cuerpo a la variable {{1}} del template', () => {
    expect(captureContentVariables('Hola\nlínea 2')).toBe(
      JSON.stringify({ '1': 'Hola\nlínea 2' }),
    )
  })
})
