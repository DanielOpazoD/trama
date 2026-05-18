import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTrama } from '../state'
import type { ExtractionProposal } from '../types'

export function ExtractBar({
  onProposal,
  busy,
}: {
  onProposal: (text: string, proposal: ExtractionProposal) => void
  busy: boolean
}) {
  const { extract, offline } = useTrama()
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-grow textarea up to a cap.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || loading || busy) return
    setError(null)
    setLoading(true)
    try {
      const proposal = await extract(trimmed)
      onProposal(trimmed, proposal)
      setText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      handleSubmit()
    }
  }

  const disabled = !text.trim() || loading || busy || offline

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-6 flex justify-center">
      <div className="pointer-events-auto w-full max-w-2xl">
        {error && (
          <div className="mb-2 px-3 py-2 bg-red-50/95 border border-red-200 rounded-lg text-xs text-red-800 shadow-sm">
            {error}
          </div>
        )}
        {offline && (
          <div className="mb-2 px-3 py-2 bg-amber-50/95 border border-amber-200 rounded-lg text-xs text-amber-800 shadow-sm">
            Sin backend — la extracción por IA no está disponible en modo local. Lo
            manual sí funciona desde las listas en la barra lateral.
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 bg-paper-50/95 border border-ink-100 rounded-2xl shadow-lg shadow-ink-900/5 p-2 backdrop-blur-sm"
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="¿en qué andabas pensando? un libro, una idea suelta, una conversación…"
            rows={1}
            disabled={loading || busy}
            className="flex-1 resize-none bg-transparent px-3 py-2 text-ink-700 placeholder:text-ink-300 focus:outline-none leading-relaxed"
          />
          <button
            type="submit"
            disabled={disabled}
            aria-label="Extraer"
            className="self-end mb-1 mr-1 size-9 rounded-full bg-ink-700 text-paper-50 hover:bg-ink-600 disabled:bg-ink-100 disabled:text-ink-300 transition-colors flex items-center justify-center"
            title="Extraer (⌘/Ctrl+Enter)"
          >
            {loading ? (
              <span className="size-3.5 border-2 border-paper-50/40 border-t-paper-50 rounded-full animate-spin" />
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
