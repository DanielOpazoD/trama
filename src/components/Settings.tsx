import { useEffect, useState } from 'react'
import type { OAuthReturn } from '../lib/oauthReturn'
import { CloseIcon } from './Icons'
import { SettingsNav } from './settings/SettingsNav'
import { SettingsPanelContent } from './settings/SettingsPanelContent'
import {
  getInitialSettingsSection,
  type SettingsSectionId,
} from './settings/settingsModel'

/**
 * Settings — modal full-screen con layout de dos columnas:
 *   - sidebar izquierdo (rail de navegación) con las secciones
 *   - panel derecho con el contenido de la sección activa
 *
 * Antes era un panel chico centrado de max-w-md que se sentía
 * apretado en pantallas grandes (parecía solo cubrir el tercio
 * inferior). Ahora ocupa la mayor parte del viewport — mismo
 * patrón que Linear, macOS System Settings, VS Code.
 *
 * Responsive: en mobile las tabs colapsan a chips horizontales arriba.
 *
 * ε3: cada panel vive en su propio archivo bajo src/components/settings/.
 * Settings.tsx queda solo con el shell + el switch. Para agregar un
 * panel nuevo: archivo nuevo en settings/, añadir id a SectionId, label
 * a SECTIONS, branch en el switch del render.
 */

export function Settings({
  open,
  onClose,
  theme,
  onSetTheme,
  initialSection,
  oauthReturn,
}: {
  open: boolean
  onClose: () => void
  // ν3: tres temas. AppearancePanel acepta setTheme directo en vez de
  // toggle binario.
  theme: 'paper' | 'night' | 'vela'
  onSetTheme: (t: 'paper' | 'night' | 'vela') => void
  // Sección inicial al abrir (p.ej. el retorno de un OAuth abre 'x'/'spotify').
  initialSection?: SettingsSectionId
  // Resultado de un callback OAuth, para que el panel lo muestre.
  oauthReturn?: OAuthReturn | null
}) {
  const [section, setSection] = useState<SettingsSectionId>(() =>
    getInitialSettingsSection(initialSection),
  )

  useEffect(() => {
    setSection(getInitialSettingsSection(initialSection))
  }, [initialSection])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar configuración"
        className="fixed inset-0 z-30 bg-ink-900/30 backdrop-blur-sm cursor-default animate-view-fade"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-label="Configuración"
        className="fixed inset-4 md:inset-8 lg:inset-12 z-40 max-w-6xl max-h-[calc(100vh-4rem)] mx-auto
                   bg-paper-50 border border-ink-100 rounded-xl shadow-lg shadow-ink-900/15
                   animate-fade-up flex flex-col overflow-hidden"
      >
        <header className="px-6 py-4 border-b border-ink-100/60 flex items-baseline justify-between shrink-0">
          <div>
            <p className="text-micro uppercase tracking-eyebrow text-ink-300 mb-1">
              ajustes
            </p>
            <h2 className="font-serif text-2xl text-ink-700 leading-none">
              Configuración
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors"
          >
            <CloseIcon size={14} />
          </button>
        </header>

        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          <SettingsNav section={section} onSectionChange={setSection} />

          {/* Panel de contenido — scrollable */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10">
            <SettingsPanelContent
              section={section}
              theme={theme}
              onSetTheme={onSetTheme}
              oauthReturn={oauthReturn}
            />
          </div>
        </div>
      </div>
    </>
  )
}
