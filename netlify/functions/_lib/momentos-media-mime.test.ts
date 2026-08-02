import { describe, expect, it } from 'vitest'
import {
  isAllowedMomentoMime,
  isR2MomentoKey,
  momentoExtensionFor,
  R2_KEY_MARKER,
} from './momentos-media-mime'

/**
 * El discriminador de origen de las claves de Momentos.
 *
 * `momentos-file` decide con esto si sirve desde Netlify Blobs o si redirige a
 * una URL firmada de R2, y **ninguna equivocación da un error legible**:
 *
 *   - Un falso negativo (una clave de R2 que no se reconoce) busca el blob en
 *     Netlify Blobs, no lo encuentra y devuelve 404: el video "desaparece".
 *   - Un falso positivo (una clave vieja tomada por R2) firma un GET contra un
 *     objeto que no existe en el bucket y responde un 302 a una URL rota.
 *
 * Por eso el marcador es `r2-` y el resto de la clave es hexadecimal: el hex no
 * contiene la letra `r`, así que ninguna clave ya persistida puede confundirse.
 */
describe('isR2MomentoKey', () => {
  it('reconoce una clave de R2 con su userId delante', () => {
    expect(isR2MomentoKey(`user_123/${R2_KEY_MARKER}deadbeef.mp4`)).toBe(true)
  })

  /** El invariante que hace seguro el marcador: las claves ya persistidas son
   *  hexadecimales y el hex no tiene `r`. */
  it('NO confunde una clave hexadecimal ya existente', () => {
    expect(isR2MomentoKey('user_123/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6.jpg')).toBe(false)
    // Ningún dígito hexadecimal puede formar el prefijo.
    expect(R2_KEY_MARKER).toMatch(/[^0-9a-f]/)
  })

  /** Las claves legacy no llevan `${userId}/`: el marcador se busca igual al
   *  principio, o esas claves quedarían mal clasificadas al servirlas. */
  it('funciona con claves legacy sin userId', () => {
    expect(isR2MomentoKey(`${R2_KEY_MARKER}deadbeef.mp4`)).toBe(true)
    expect(isR2MomentoKey('deadbeef.jpg')).toBe(false)
  })

  /** Un `r2-` en el userId no debe contar: lo que decide es el tramo del
   *  archivo, no el del dueño. */
  it('no se deja engañar por un userId que empieza igual', () => {
    expect(isR2MomentoKey('r2-usuario/a1b2c3.jpg')).toBe(false)
  })
})

describe('isAllowedMomentoMime', () => {
  it('acepta las imágenes y los videos que declara el composer', () => {
    for (const mime of [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ]) {
      expect(isAllowedMomentoMime(mime)).toBe(true)
    }
  })

  it('rechaza lo que no es media visual', () => {
    expect(isAllowedMomentoMime('application/pdf')).toBe(false)
    expect(isAllowedMomentoMime('audio/mpeg')).toBe(false)
    expect(isAllowedMomentoMime('video/x-msvideo')).toBe(false)
  })
})

describe('momentoExtensionFor', () => {
  it('traduce el mime a su extensión', () => {
    expect(momentoExtensionFor('video/quicktime')).toBe('mov')
    expect(momentoExtensionFor('image/jpeg')).toBe('jpg')
  })

  it('cae a bin para un mime desconocido', () => {
    expect(momentoExtensionFor('application/octet-stream')).toBe('bin')
  })
})
