import { describe, expect, it } from 'vitest'
import { checkLegacyMediaFallbacks } from './check-legacy-media-fallbacks.mjs'

describe('check legacy media fallbacks', () => {
  it('acepta el fallback legacy concentrado en AuthenticatedMedia', () => {
    const result = checkLegacyMediaFallbacks({
      files: {
        'src/components/momentos/AuthenticatedMedia.tsx':
          'const legacyResponse = await fetch(src, { signal, headers: {} })',
        'src/components/momentos/authenticatedMediaModel.ts':
          "return src.startsWith('/api/momentos-file/')",
      },
    })

    expect(result).toMatchObject({
      ok: true,
      count: 1,
      baseline: 1,
    })
  })

  it('rechaza fetch sin auth para media fuera del archivo permitido', () => {
    const result = checkLegacyMediaFallbacks({
      files: {
        'src/components/momentos/AuthenticatedMedia.tsx':
          'const legacyResponse = await fetch(src, { signal, headers: {} })',
        'src/components/Other.tsx':
          "await fetch('/api/momentos-file/foto-legacy.jpg', { headers: {} })",
      },
    })

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        {
          file: 'src/components/Other.tsx',
          count: 1,
          reason: 'unauthenticated_legacy_media_fetch_not_allowlisted',
        },
      ]),
    )
  })

  it('falla si crece el numero de fallbacks permitidos', () => {
    const result = checkLegacyMediaFallbacks({
      baseline: 1,
      files: {
        'src/components/momentos/AuthenticatedMedia.tsx': [
          'await fetch(src, { signal, headers: {} })',
          'await fetch(src, { headers: {} })',
        ].join('\n'),
      },
    })

    expect(result.ok).toBe(false)
    expect(result.failures).toEqual([
      {
        file: 'src/components/momentos/AuthenticatedMedia.tsx',
        count: 2,
        reason: 'legacy_media_fallback_baseline_exceeded',
      },
    ])
  })
})
