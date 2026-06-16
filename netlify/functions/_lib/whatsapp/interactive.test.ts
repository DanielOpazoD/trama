import { describe, expect, it } from 'vitest'
import {
  readInteractiveConfig,
  pickCaptureContentSid,
  captureContentVariables,
  cardContentVariables,
  deepLinkSuffix,
} from './interactive'

describe('readInteractiveConfig', () => {
  it('lee los ContentSid de las env vars (reader inyectado)', () => {
    const env: Record<string, string> = {
      TWILIO_CONTENT_SID_CAPTURE: 'HXcap',
      TWILIO_CONTENT_SID_CAPTURE_DESTINO: 'HXdest',
      TWILIO_CONTENT_SID_CAPTURE_FOTO: 'HXfoto',
      TWILIO_CONTENT_SID_CAPTURE_ACTIONS: 'HXacts',
      TWILIO_CONTENT_SID_CAPTURE_CARD: 'HXcard',
      TWILIO_CONTENT_SID_MENU: 'HXmenu',
    }
    expect(readInteractiveConfig((k) => env[k])).toEqual({
      captureSid: 'HXcap',
      destinoSid: 'HXdest',
      fotoSid: 'HXfoto',
      actionsSid: 'HXacts',
      cardSid: 'HXcard',
      menuSid: 'HXmenu',
    })
  })

  it('ausentes → null (los botones quedan apagados, cae a TwiML)', () => {
    expect(readInteractiveConfig(() => undefined)).toEqual({
      captureSid: null,
      destinoSid: null,
      fotoSid: null,
      actionsSid: null,
      cardSid: null,
      menuSid: null,
    })
  })
})

describe('pickCaptureContentSid', () => {
  const all = {
    captureSid: 'HXcap',
    destinoSid: 'HXdest',
    fotoSid: 'HXfoto',
    actionsSid: 'HXacts',
    cardSid: 'HXcard',
    menuSid: 'HXmenu',
  }

  it('foto → prefiere el List Picker de acciones', () => {
    expect(pickCaptureContentSid(all, 'foto')).toBe('HXacts')
  })

  it('foto sin lista de acciones → cae a la quick-reply de foto', () => {
    expect(pickCaptureContentSid({ ...all, actionsSid: null }, 'foto')).toBe('HXfoto')
  })

  it('ambiguo → usa la MISMA lista «Acciones» que las fotos', () => {
    expect(pickCaptureContentSid(all, 'ambiguous')).toBe('HXacts')
  })

  it('ambiguo sin lista → cae a la quick-reply de destino', () => {
    expect(pickCaptureContentSid({ ...all, actionsSid: null }, 'ambiguous')).toBe(
      'HXdest',
    )
  })

  it('simple → plantilla de solo Deshacer', () => {
    expect(pickCaptureContentSid(all, 'simple')).toBe('HXcap')
  })

  it('foto sin lista ni quick-reply de foto → cae a destino, luego a Deshacer', () => {
    expect(
      pickCaptureContentSid({ ...all, actionsSid: null, fotoSid: null }, 'foto'),
    ).toBe('HXdest')
    expect(
      pickCaptureContentSid(
        { ...all, actionsSid: null, fotoSid: null, destinoSid: null },
        'foto',
      ),
    ).toBe('HXcap')
  })

  it('ambiguo sin lista ni destino → cae a la de Deshacer', () => {
    expect(
      pickCaptureContentSid({ ...all, actionsSid: null, destinoSid: null }, 'ambiguous'),
    ).toBe('HXcap')
  })

  it('simple sin captura → null (no usa la de destino para algo explícito)', () => {
    expect(pickCaptureContentSid({ ...all, captureSid: null }, 'simple')).toBeNull()
  })

  it('sin ninguna plantilla → null', () => {
    expect(
      pickCaptureContentSid(
        {
          captureSid: null,
          destinoSid: null,
          fotoSid: null,
          actionsSid: null,
          cardSid: null,
          menuSid: null,
        },
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

describe('cardContentVariables / deepLinkSuffix', () => {
  it('card: {{1}} cuerpo, {{2}} sufijo del deep link', () => {
    expect(cardContentVariables('Guardado.', '/?world=notas')).toBe(
      JSON.stringify({ '1': 'Guardado.', '2': '/?world=notas' }),
    )
  })

  it('deepLinkSuffix devuelve path+query (sin dominio)', () => {
    expect(deepLinkSuffix('https://tramadaod.netlify.app/?world=notas&x=1')).toBe(
      '/?world=notas&x=1',
    )
    expect(deepLinkSuffix('no-es-url')).toBe('/')
  })
})
