import { lazy, Suspense } from 'react'
import type { OAuthReturn } from '../../lib/oauthReturn'
import { SETTINGS_SECTIONS, type SettingsSectionId } from './settingsModel'

const lazyPanelImporters = {
  ai: () => import('./AIPanel'),
  data: () => import('./DataPanel'),
  extension: () => import('./ExtensionPanel'),
  logs: () => import('./LogsPanel'),
  personalization: () => import('./PersonalizationPanel'),
  privacy: () => import('./PrivacyPanel'),
  search: () => import('./SearchPanel'),
  spotify: () => import('./SpotifyPanel'),
  whatsapp: () => import('./WhatsAppPanel'),
  x: () => import('./XPanel'),
} satisfies Partial<Record<SettingsSectionId, () => Promise<unknown>>>

const AIPanel = lazy(() =>
  lazyPanelImporters.ai().then((mod) => ({ default: mod.AIPanel })),
)
const DataPanel = lazy(() =>
  lazyPanelImporters.data().then((mod) => ({ default: mod.DataPanel })),
)
const ExtensionPanel = lazy(() =>
  lazyPanelImporters.extension().then((mod) => ({ default: mod.ExtensionPanel })),
)
const LogsPanel = lazy(() =>
  lazyPanelImporters.logs().then((mod) => ({ default: mod.LogsPanel })),
)
const PersonalizationPanel = lazy(() =>
  lazyPanelImporters.personalization().then((mod) => ({
    default: mod.PersonalizationPanel,
  })),
)
const PrivacyPanel = lazy(() =>
  lazyPanelImporters.privacy().then((mod) => ({ default: mod.PrivacyPanel })),
)
const SearchPanel = lazy(() =>
  lazyPanelImporters.search().then((mod) => ({ default: mod.SearchPanel })),
)
const SpotifyPanel = lazy(() =>
  lazyPanelImporters.spotify().then((mod) => ({ default: mod.SpotifyPanel })),
)
const WhatsAppPanel = lazy(() =>
  lazyPanelImporters.whatsapp().then((mod) => ({ default: mod.WhatsAppPanel })),
)
const XPanel = lazy(() => lazyPanelImporters.x().then((mod) => ({ default: mod.XPanel })))

export function preloadSettingsPanel(section: SettingsSectionId) {
  const importer =
    section in lazyPanelImporters
      ? lazyPanelImporters[section as keyof typeof lazyPanelImporters]
      : undefined
  void importer?.()
}

function SettingsPanelFallback({ section }: { section: SettingsSectionId }) {
  const label = SETTINGS_SECTIONS.find((item) => item.id === section)?.label ?? 'panel'
  return (
    <section aria-label={`Cargando ${label}`} className="min-h-32">
      <p className="text-caption text-ink-300 italic">cargando…</p>
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
