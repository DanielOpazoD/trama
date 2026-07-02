import { lazy, Suspense } from 'react'
import type { OAuthReturn } from '../../lib/oauthReturn'
import { SETTINGS_SECTIONS, type SettingsSectionId } from './settingsModel'

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

export function SettingsLazyPanelHost({
  section,
  oauthReturn,
}: {
  section: SettingsSectionId
  oauthReturn: OAuthReturn | null
}) {
  return (
    <Suspense fallback={<SettingsPanelFallback section={section} />}>
      {section === 'logs' && <LogsPanel />}
      {section === 'personalization' && <PersonalizationPanel />}
      {section === 'privacy' && <PrivacyPanel />}
      {section === 'spotify' && <SpotifyPanel oauthReturn={oauthReturn} />}
      {section === 'extension' && <ExtensionPanel />}
      {section === 'whatsapp' && <WhatsAppPanel />}
      {section === 'x' && <XPanel oauthReturn={oauthReturn} />}
      {section === 'ai' && <AIPanel />}
      {section === 'search' && <SearchPanel />}
      {section === 'data' && <DataPanel />}
    </Suspense>
  )
}
