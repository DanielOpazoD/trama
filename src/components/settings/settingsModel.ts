import type { OAuthReturn } from '../../lib/oauthReturn'

export type SettingsSectionId =
  | 'health'
  | 'logs'
  | 'appearance'
  | 'personalization'
  | 'privacy'
  | 'spotify'
  | 'extension'
  | 'whatsapp'
  | 'x'
  | 'ai'
  | 'search'
  | 'data'

export const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId
  label: string
  hint: string
}> = [
  { id: 'health', label: 'Estado', hint: 'gasto, conteos, errores' },
  { id: 'logs', label: 'Logs', hint: 'historial detallado' },
  { id: 'appearance', label: 'Apariencia', hint: 'papel / noche' },
  {
    id: 'personalization',
    label: 'Personalización',
    hint: 'secciones · PIN · mundo default',
  },
  { id: 'privacy', label: 'Privacidad', hint: 'bloqueo por PIN' },
  { id: 'spotify', label: 'Spotify', hint: 'sincronización' },
  { id: 'extension', label: 'Extensión', hint: 'recortes desde Chrome' },
  { id: 'whatsapp', label: 'WhatsApp', hint: 'capturar por mensaje' },
  { id: 'x', label: 'X (Twitter)', hint: 'bookmarks' },
  { id: 'ai', label: 'IA por tarea', hint: 'modelo por flujo' },
  { id: 'search', label: 'Búsqueda', hint: 'embeddings + reindexado' },
  { id: 'data', label: 'Datos', hint: 'export / import' },
]

export function getInitialSettingsSection(
  initialSection: SettingsSectionId | undefined,
): SettingsSectionId {
  return initialSection ?? 'health'
}

export function resolveSettingsOauthReturn({
  section,
  oauthReturn,
}: {
  section: SettingsSectionId
  oauthReturn?: OAuthReturn | null
}): OAuthReturn | null {
  if (!oauthReturn) return null
  if (section === 'spotify' && oauthReturn.provider === 'spotify') return oauthReturn
  if (section === 'x' && oauthReturn.provider === 'x') return oauthReturn
  return null
}
