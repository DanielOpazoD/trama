import { useEffect, useState } from 'react'
import { CloseIcon } from './Icons'
import { AppearancePanel } from './settings/AppearancePanel'
import { SpotifyPanel } from './settings/SpotifyPanel'
import { AIPanel } from './settings/AIPanel'
import { SearchPanel } from './settings/SearchPanel'
import { DataPanel } from './settings/DataPanel'
import { HealthPanel } from './settings/HealthPanel'

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

type SectionId = 'health' | 'appearance' | 'spotify' | 'ai' | 'search' | 'data'

const SECTIONS: Array<{ id: SectionId; label: string; hint: string }> = [
  { id: 'health',     label: 'Estado',        hint: 'gasto, conteos, errores' },
  { id: 'appearance', label: 'Apariencia',    hint: 'papel / noche' },
  { id: 'spotify',    label: 'Spotify',       hint: 'sincronización' },
  { id: 'ai',         label: 'IA por tarea',  hint: 'modelo por flujo' },
  { id: 'search',     label: 'Búsqueda',      hint: 'embeddings + reindexado' },
  { id: 'data',       label: 'Datos',         hint: 'export / import' },
]

export function Settings({
  open,
  onClose,
  theme,
  onToggleTheme,
}: {
  open: boolean
  onClose: () => void
  theme: 'paper' | 'night'
  onToggleTheme: () => void
}) {
  const [section, setSection] = useState<SectionId>('health')

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
            <p className="text-micro uppercase tracking-eyebrow text-ink-300 mb-1">ajustes</p>
            <h2 className="font-serif text-2xl text-ink-700 leading-none">Configuración</h2>
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
          {/* Rail de navegación — vertical en desktop, horizontal scrollable en mobile */}
          <nav
            className="md:w-52 shrink-0 md:border-r border-b md:border-b-0 border-ink-100/60
                       p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible md:overflow-y-auto"
            aria-label="Secciones de configuración"
          >
            {SECTIONS.map((s) => {
              const active = section === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => setSection(s.id)}
                  className={`group shrink-0 md:shrink text-left px-3 py-2 rounded-md transition-colors ${
                    active
                      ? 'bg-ink-100 text-ink-800'
                      : 'text-ink-500 hover:text-ink-800 hover:bg-ink-100/60'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <div className={`text-sm ${active ? 'font-medium' : ''}`}>
                    {s.label}
                  </div>
                  <div className="hidden md:block text-micro text-ink-300 mt-0.5 leading-tight">
                    {s.hint}
                  </div>
                </button>
              )
            })}
          </nav>

          {/* Panel de contenido — scrollable */}
          <main className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10">
            <div className="max-w-2xl mx-auto animate-fade-up">
              {section === 'health' && <HealthPanel />}
              {section === 'appearance' && (
                <AppearancePanel theme={theme} onToggleTheme={onToggleTheme} />
              )}
              {section === 'spotify' && <SpotifyPanel />}
              {section === 'ai' && <AIPanel />}
              {section === 'search' && <SearchPanel />}
              {section === 'data' && <DataPanel />}
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
