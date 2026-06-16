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
      TWILIO_CONTENT_SID_CAPTURE_FOTO: 'HXfoto',
      TWILIO_CONTENT_SID_MENU: 'HXmenu',
    }
    expect(readInteractiveConfig((k) => env[k])).toEqual({
      captureSid: 'HXcap',
      destinoSid: 'HXdest',
      fotoSid: 'HXfoto',
      menuSid: 'HXmenu',
    })
  })

  it('ausentes → null (los botones quedan apagados, cae a TwiML)', () => {
    expect(readInteractiveConfig(() => undefined)).toEqual({
      captureSid: null,
      destinoSid: null,
      fotoSid: null,
      menuSid: null,
    })
  })
})

describe('pickCaptureContentSid', () => {
  const all = {
    captureSid: 'HXcap',
    destinoSid: 'HXdest',
    fotoSid: 'HXfoto',
    menuSid: 'HXmenu',
  }

  it('foto → plantilla con botón Descripción', () => {
    expect(pickCaptureContentSid(all, 'foto')).toBe('HXfoto')
  })

  it('ambiguo → plantilla con botones de destino', () => {
    expect(pickCaptureContentSid(all, 'ambiguous')).toBe('HXdest')
  })

  it('simple → plantilla de solo Deshacer', () => {
    expect(pickCaptureContentSid(all, 'simple')).toBe('HXcap')
  })

  it('foto sin plantilla de foto → cae a destino, luego a Deshacer', () => {
    expect(pickCaptureContentSid({ ...all, fotoSid: null }, 'foto')).toBe('HXdest')
    expect(
      pickCaptureContentSid({ ...all, fotoSid: null, destinoSid: null }, 'foto'),
    ).toBe('HXcap')
  })

  it('ambiguo sin destino → cae a la de Deshacer', () => {
    expect(pickCaptureContentSid({ ...all, destinoSid: null }, 'ambiguous')).toBe('HXcap')
  })

  it('simple sin captura → null (no usa la de destino para algo explícito)', () => {
    expect(pickCaptureContentSid({ ...all, captureSid: null }, 'simple')).toBeNull()
  })

  it('sin ninguna plantilla → null', () => {
    expect(
      pickCaptureContentSid(
        { captureSid: null, destinoSid: null, fotoSid: null, menuSid: null },
        'foto',
      ),
    ).toBeNull()
  })
})

describe('captureContentVariables', () => {
  it('mapea el cuerpo a la variable {{1}} del template', () => {
    expect(captureContentVariables('Hola\nlínea 2')).toBe(
      JSON.stringify({ '1': 'Hola\nlínea 2' }),
    )
  })
})
