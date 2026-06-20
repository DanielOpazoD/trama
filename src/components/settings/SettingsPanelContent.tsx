import type { OAuthReturn } from '../../lib/oauthReturn'
import { TramaMark } from '../Icons'
import { AIPanel } from './AIPanel'
import { AppearancePanel } from './AppearancePanel'
import { DataPanel } from './DataPanel'
import { ExtensionPanel } from './ExtensionPanel'
import { HealthPanel } from './HealthPanel'
import { LogsPanel } from './LogsPanel'
import { PersonalizationPanel } from './PersonalizationPanel'
import { PrivacyPanel } from './PrivacyPanel'
import { SearchPanel } from './SearchPanel'
import { SpotifyPanel } from './SpotifyPanel'
import { WhatsAppPanel } from './WhatsAppPanel'
import { XPanel } from './XPanel'
import { resolveSettingsOauthReturn, type SettingsSectionId } from './settingsModel'

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
  return (
    <div className="max-w-2xl mx-auto animate-fade-up">
      {section === 'health' && <HealthPanel />}
      {section === 'logs' && <LogsPanel />}
      {section === 'appearance' && (
        <AppearancePanel theme={theme} onSetTheme={onSetTheme} />
      )}
      {section === 'personalization' && <PersonalizationPanel />}
      {section === 'privacy' && <PrivacyPanel />}
      {section === 'spotify' && <SpotifyPanel oauthReturn={providerOauth} />}
      {section === 'extension' && <ExtensionPanel />}
      {section === 'whatsapp' && <WhatsAppPanel />}
      {section === 'x' && <XPanel oauthReturn={providerOauth} />}
      {section === 'ai' && <AIPanel />}
      {section === 'search' && <SearchPanel />}
      {section === 'data' && <DataPanel />}

      <footer className="mt-16 pt-6 border-t border-ink-100/40 flex flex-col items-center gap-3">
        <TramaMark size={14} className="text-ink-200" />
        <p className="font-serif italic text-xs text-ink-300 leading-relaxed text-center">
          Trama — compuesto en Spectral e Inter,
          <br />
          primavera de {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  )
}
