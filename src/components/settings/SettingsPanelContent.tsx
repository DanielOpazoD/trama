import { lazy, Suspense } from 'react'
import type { OAuthReturn } from '../../lib/oauthReturn'
import { TramaMark } from '../Icons'
import { AppearancePanel } from './AppearancePanel'
import { HealthPanel } from './HealthPanel'
import {
  SETTINGS_SECTIONS,
  getSettingsPanelLoadMode,
  resolveSettingsOauthReturn,
  type SettingsSectionId,
} from './settingsModel'

const AIPanel = lazy(() => import('./AIPanel').then((mod) => ({ default: mod.AIPanel })))
const DataPanel = lazy(() =>
  import('./DataPanel').then((mod) => ({ default: mod.DataPanel })),
)
const ExtensionPanel = lazy(() =>
  import('./ExtensionPanel').then((mod) => ({ default: mod.ExtensionPanel })),
)
const LogsPanel = lazy(() =>
  import('./LogsPanel').then((mod) => ({ default: mod.LogsPanel })),
)
const PersonalizationPanel = lazy(() =>
  import('./PersonalizationPanel').then((mod) => ({
    default: mod.PersonalizationPanel,
  })),
)
const PrivacyPanel = lazy(() =>
  import('./PrivacyPanel').then((mod) => ({ default: mod.PrivacyPanel })),
)
const SearchPanel = lazy(() =>
  import('./SearchPanel').then((mod) => ({ default: mod.SearchPanel })),
)
const SpotifyPanel = lazy(() =>
  import('./SpotifyPanel').then((mod) => ({ default: mod.SpotifyPanel })),
)
const WhatsAppPanel = lazy(() =>
  import('./WhatsAppPanel').then((mod) => ({ default: mod.WhatsAppPanel })),
)
const XPanel = lazy(() => import('./XPanel').then((mod) => ({ default: mod.XPanel })))

function SettingsPanelFallback({ section }: { section: SettingsSectionId }) {
  const label = SETTINGS_SECTIONS.find((item) => item.id === section)?.label ?? 'panel'
  return (
    <section aria-label={`Cargando ${label}`} className="min-h-32">
      <p className="text-xs text-ink-300 italic">cargando…</p>
    </section>
  )
}

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
        <Suspense fallback={<SettingsPanelFallback section={section} />}>
          {section === 'logs' && <LogsPanel />}
          {section === 'personalization' && <PersonalizationPanel />}
          {section === 'privacy' && <PrivacyPanel />}
          {section === 'spotify' && <SpotifyPanel oauthReturn={providerOauth} />}
          {section === 'extension' && <ExtensionPanel />}
          {section === 'whatsapp' && <WhatsAppPanel />}
          {section === 'x' && <XPanel oauthReturn={providerOauth} />}
          {section === 'ai' && <AIPanel />}
          {section === 'search' && <SearchPanel />}
          {section === 'data' && <DataPanel />}
        </Suspense>
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
