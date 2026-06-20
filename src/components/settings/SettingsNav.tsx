import { SETTINGS_SECTIONS, type SettingsSectionId } from './settingsModel'

export function SettingsNav({
  section,
  onSectionChange,
}: {
  section: SettingsSectionId
  onSectionChange: (section: SettingsSectionId) => void
}) {
  return (
    <nav
      className="md:w-52 shrink-0 md:border-r border-b md:border-b-0 border-ink-100/60
                 p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible md:overflow-y-auto"
      aria-label="Secciones de configuración"
    >
      {SETTINGS_SECTIONS.map((s) => {
        const active = section === s.id
        return (
          <button
            key={s.id}
            onClick={() => onSectionChange(s.id)}
            className={`group shrink-0 md:shrink text-left px-3 py-2 rounded-md transition-colors ${
              active
                ? 'bg-ink-100 text-ink-800'
                : 'text-ink-500 hover:text-ink-800 hover:bg-ink-100/60'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            <div className={`text-sm ${active ? 'font-medium' : ''}`}>{s.label}</div>
            <div className="hidden md:block text-micro text-ink-300 mt-0.5 leading-tight">
              {s.hint}
            </div>
          </button>
        )
      })}
    </nav>
  )
}
