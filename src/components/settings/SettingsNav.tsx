import { useScrollRailWithActive } from '../../hooks/useScrollRail'
import {
  SETTINGS_SECTIONS,
  getSettingsPanelLoadMode,
  type SettingsSectionId,
} from './settingsModel'
import { preloadSettingsPanel } from './SettingsLazyPanelHost'

export function SettingsNav({
  section,
  onSectionChange,
}: {
  section: SettingsSectionId
  onSectionChange: (section: SettingsSectionId) => void
}) {
  // En móvil esta navegación es un carril horizontal y ocultaba el 69% de sus
  // doce secciones sin ninguna señal de que siguieran — el mismo defecto que la
  // barra del mundo Notas en el PR #365. Se reutiliza el mismo tratamiento: el
  // borde se deshace hacia donde queda contenido y la sección activa se
  // reencuadra. En `md` el carril desaparece (columna) y con él la máscara.
  const rail = useScrollRailWithActive<HTMLElement>(section)

  return (
    <nav
      ref={rail.ref}
      className="scroll-rail md:w-52 shrink-0 md:border-r border-b md:border-b-0 border-ink-100/60
                 p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible md:overflow-y-auto
                 md:[-webkit-mask-image:none] md:[mask-image:none]"
      data-rail-start={rail.hint.inicio}
      data-rail-end={rail.hint.fin}
      aria-label="Secciones de configuración"
    >
      {SETTINGS_SECTIONS.map((s) => {
        const active = section === s.id
        const preloadPanel = () => {
          if (getSettingsPanelLoadMode(s.id) === 'lazy') preloadSettingsPanel(s.id)
        }
        return (
          <button
            key={s.id}
            onClick={() => onSectionChange(s.id)}
            onFocus={preloadPanel}
            onPointerEnter={preloadPanel}
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
