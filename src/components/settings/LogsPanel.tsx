import { useState } from 'react'
import { PanelHeader } from './_shared'
import { LogsErrorList } from './LogsErrorList'
import { LogsExtractionList } from './LogsExtractionList'

/**
 * ε4: Panel "Logs" — UIs para error_log y extraction_log que el HealthPanel
 * solo resumía. Aquí puedes ver:
 *   - errores históricos con stack trace expandible
 *   - cada llamada al LLM con costo/tokens/duración
 *
 * Dos sub-tabs internos. Stack traces colapsados por default (ocupan
 * mucho); click para expandir. Refresh manual con botón — no auto-poll
 * porque estos logs no son críticos en tiempo real.
 */

export function LogsPanel() {
  const [view, setView] = useState<'errors' | 'extractions'>('errors')

  return (
    <section className="space-y-6">
      <PanelHeader
        title="Logs"
        hint="Historial de errores y llamadas a IA. Para diagnóstico cuando algo no se comportó como esperabas."
      />

      {/* Sub-tabs internas */}
      <div className="card-segment flex gap-2">
        <button
          onClick={() => setView('errors')}
          className={`px-3 py-1.5 rounded text-sm transition-all duration-150 ${
            view === 'errors'
              ? 'bg-paper-50 text-ink-700 shadow-sm'
              : 'text-ink-400 hover:text-ink-700'
          }`}
        >
          Errores
        </button>
        <button
          onClick={() => setView('extractions')}
          className={`px-3 py-1.5 rounded text-sm transition-all duration-150 ${
            view === 'extractions'
              ? 'bg-paper-50 text-ink-700 shadow-sm'
              : 'text-ink-400 hover:text-ink-700'
          }`}
        >
          Llamadas IA
        </button>
      </div>

      {view === 'errors' ? <LogsErrorList /> : <LogsExtractionList />}
    </section>
  )
}
