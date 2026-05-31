import { useEffect, useState } from 'react'
import { request } from '../../api/request'
import { ProgressBar } from '../ProgressBar'
import { PanelHeader } from './_shared'

export function SearchPanel() {
  return (
    <section>
      <PanelHeader
        title="Búsqueda semántica"
        hint="La búsqueda en la sidebar combina coincidencia textual con similitud por significado vía embeddings. Las entidades y citas nuevas se indexan al guardarse. Para indexar lo que ya tenías, dispara una reindexación."
      />
      <ReindexEmbeddingsSection />
    </section>
  )
}

/**
 * Triggers a batched reindex of entities and quotes that don't have an
 * embedding yet. Polls the same endpoint with POST until remaining=0.
 *
 * Vive co-localizado con SearchPanel porque es su única superficie de
 * uso. Si en el futuro hay otro panel que necesite reindex, mover a
 * _shared.
 */
function ReindexEmbeddingsSection() {
  const [pending, setPending] = useState<{ entities: number; quotes: number } | null>(
    null,
  )
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Total al inicio del run — para calcular progreso real (processed/total)
  // en lugar de un spinner indeterminate.
  const [runStartTotal, setRunStartTotal] = useState(0)
  const [runProcessed, setRunProcessed] = useState(0)

  useEffect(() => {
    let mounted = true
    request<{ entities: number; quotes: number }>('/api/reindex-embeddings')
      .then((data) => {
        if (mounted && data) setPending(data)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  async function run() {
    setRunning(true)
    setError(null)
    const startTotal = (pending?.entities ?? 0) + (pending?.quotes ?? 0)
    setRunStartTotal(startTotal)
    setRunProcessed(0)
    try {
      let total = 0
      for (let i = 0; i < 200; i++) {
        const data = await request<{
          processed: number
          remaining: { entities: number; quotes: number }
        }>('/api/reindex-embeddings', { method: 'POST' })
        total += data.processed
        setPending(data.remaining)
        setRunProcessed(total)
        if (data.processed === 0) break
        if (data.remaining.entities + data.remaining.quotes === 0) break
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const totalPending = pending ? pending.entities + pending.quotes : null

  return (
    <div className="space-y-3">
      {totalPending !== null && !running && (
        <p className="text-xs text-ink-400">
          {totalPending === 0
            ? 'Todo indexado. Tu trama es buscable por significado.'
            : `Sin indexar: ${pending?.entities ?? 0} entidades, ${
                pending?.quotes ?? 0
              } citas.`}
        </p>
      )}
      {running && (
        <ProgressBar
          label="Indexando embeddings"
          current={runProcessed}
          total={runStartTotal}
          hint="25 items por batch — no recargues la página"
        />
      )}
      <div className="flex items-baseline gap-3">
        <button
          onClick={run}
          disabled={running || totalPending === 0}
          className="text-sm px-3 py-2 border border-ink-100/60 rounded-lg hover:bg-ink-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? 'indexando…' : 'Indexar lo pendiente'}
        </button>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}
