import { describe, expect, it } from 'vitest'
import {
  SETTINGS_SECTIONS,
  getInitialSettingsSection,
  getSettingsPanelLoadMode,
  resolveSettingsOauthReturn,
} from './settingsModel'

describe('settingsModel', () => {
  it('mantiene un índice declarativo de secciones', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toEqual([
      'health',
      'logs',
      'appearance',
      'personalization',
      'privacy',
      'spotify',
      'extension',
      'whatsapp',
      'x',
      'ai',
      'search',
      'data',
    ])
  })

  it('normaliza sección inicial y oauth por provider', () => {
    expect(getInitialSettingsSection(undefined)).toBe('health')
    expect(getInitialSettingsSection('x')).toBe('x')
    expect(
      resolveSettingsOauthReturn({
        section: 'spotify',
        oauthReturn: { provider: 'spotify', ok: false, code: 'denied' },
      }),
    ).toEqual({ provider: 'spotify', ok: false, code: 'denied' })
    expect(
      resolveSettingsOauthReturn({
        section: 'x',
        oauthReturn: { provider: 'spotify', ok: true, code: null },
      }),
    ).toBeNull()
  })

  it('declara qué paneles quedan eager y cuáles se cargan perezoso', () => {
    expect(getSettingsPanelLoadMode('health')).toBe('eager')
    expect(getSettingsPanelLoadMode('appearance')).toBe('eager')

    expect(
      SETTINGS_SECTIONS.filter(
        (section) => getSettingsPanelLoadMode(section.id) === 'lazy',
      ).map((section) => section.id),
    ).toEqual([
      'logs',
      'personalization',
      'privacy',
      'spotify',
      'extension',
      'whatsapp',
      'x',
      'ai',
      'search',
      'data',
    ])
  })
})
