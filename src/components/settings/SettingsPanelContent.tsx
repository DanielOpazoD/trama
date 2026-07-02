import type { OAuthReturn } from '../../lib/oauthReturn'
import { TramaMark } from '../Icons'
import { AppearancePanel } from './AppearancePanel'
import { HealthPanel } from './HealthPanel'
import {
  getSettingsPanelLoadMode,
  resolveSettingsOauthReturn,
  type SettingsSectionId,
} from './settingsModel'
import { SettingsLazyPanelHost } from './SettingsLazyPanelHost'

export function SettingsPanelContent({
  section,
  theme,
  onSetTheme,
  oauthReturn,
}: {
  section: SettingsSectionId
  theme: 'paper' | 'night' | 'vela'
  onSetTheme: (t: 'paper' | 'night' | 'vela') => void
  oauthReturn?: OAuthReturn | null
}) {
  const providerOauth = resolveSettingsOauthReturn({ section, oauthReturn })
  const panelLoadMode = getSettingsPanelLoadMode(section)

  return (
    <div className="max-w-2xl mx-auto animate-fade-up">
      {section === 'health' && <HealthPanel />}
      {section === 'appearance' && (
        <AppearancePanel theme={theme} onSetTheme={onSetTheme} />
      )}

      {panelLoadMode === 'lazy' && (
        <SettingsLazyPanelHost section={section} oauthReturn={providerOauth} />
      )}

      <footer className="mt-16 pt-6 border-t border-ink-100/40 flex flex-col items-center gap-3">
        <TramaMark size={14} className="text-ink-200" />
        <p className="font-serif italic text-caption text-ink-300 leading-relaxed text-center">
          Trama — compuesto en Spectral e Inter,
          <br />
          primavera de {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  )
}
