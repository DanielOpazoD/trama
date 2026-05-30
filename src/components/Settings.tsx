import { useEffect, useState } from 'react'
import type { OAuthReturn } from '../lib/oauthReturn'
import { CloseIcon, TramaMark } from './Icons'
import { AppearancePanel } from './settings/AppearancePanel'
import { PrivacyPanel } from './settings/PrivacyPanel'
import { SpotifyPanel } from './settings/SpotifyPanel'
import { XPanel } from './settings/XPanel'
import { AIPanel } from './settings/AIPanel'
import { SearchPanel } from './settings/SearchPanel'
import { DataPanel } from './settings/DataPanel'
import { HealthPanel } from './settings/HealthPanel'
import { LogsPanel } from './settings/LogsPanel'

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

type SectionId =
  | 'health'
  | 'logs'
  | 'appearance'
  | 'privacy'
  | 'spotify'
  | 'x'
  | 'ai'
  | 'search'
  | 'data'

const SECTIONS: Array<{ id: SectionId; label: string; hint: string }> = [
  { id: 'health', label: 'Estado', hint: 'gasto, conteos, errores' },
  { id: 'logs', label: 'Logs', hint: 'historial detallado' },
  { id: 'appearance', label: 'Apariencia', hint: 'papel / noche' },
  { id: 'privacy', label: 'Privacidad', hint: 'bloqueo por PIN' },
  { id: 'spotify', label: 'Spotify', hint: 'sincronización' },
  { id: 'x', label: 'X (Twitter)', hint: 'bookmarks' },
  { id: 'ai', label: 'IA por tarea', hint: 'modelo por flujo' },
  { id: 'search', label: 'Búsqueda', hint: 'embeddings + reindexado' },
  { id: 'data', label: 'Datos', hint: 'export / import' },
]

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
  initialSection?: SectionId
  // Resultado de un callback OAuth, para que el panel lo muestre.
  oauthReturn?: OAuthReturn | null
}) {
  const [section, setSection] = useState<SectionId>(initialSection ?? 'health')

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
              {section === 'logs' && <LogsPanel />}
              {section === 'appearance' && (
                <AppearancePanel theme={theme} onSetTheme={onSetTheme} />
              )}
              {section === 'privacy' && <PrivacyPanel />}
              {section === 'spotify' && (
                <SpotifyPanel
                  oauthReturn={oauthReturn?.provider === 'spotify' ? oauthReturn : null}
                />
              )}
              {section === 'x' && (
                <XPanel
                  oauthReturn={oauthReturn?.provider === 'x' ? oauthReturn : null}
                />
              )}
              {section === 'ai' && <AIPanel />}
              {section === 'search' && <SearchPanel />}
              {section === 'data' && <DataPanel />}

              {/* ι5: Colophon editorial — al pie de cada panel, como en
                  un libro impreso ("compuesto en…" al final). Italic
                  serif, ink-300 muted, ornament chico arriba. Gesto que
                  hace que la app se sienta autorada, no generada.
                  EE-brand #21: con TramaMark muy chico arriba — el
                  equivalente al sello/logo del impresor al cierre. */}
              <footer className="mt-16 pt-6 border-t border-ink-100/40 flex flex-col items-center gap-3">
                <TramaMark size={14} className="text-ink-200" />
                <p className="font-serif italic text-xs text-ink-300 leading-relaxed text-center">
                  Trama — compuesto en Spectral e Inter,
                  <br />
                  primavera de {new Date().getFullYear()}
                </p>
              </footer>
            </div>
          </main>
        </div>
      </div>
    </>
  )
}
