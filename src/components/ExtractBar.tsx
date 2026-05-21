import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useExtract, useOffline } from '../state'
import type { ExtractionProposal } from '../types'

export function ExtractBar({
  onProposal,
  busy,
}: {
  onProposal: (text: string, proposal: ExtractionProposal) => void
  busy: boolean
}) {
  const extract = useExtract()
  const { offline } = useOffline()
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || extract.isPending || busy) return
    try {
      const proposal = await extract.mutateAsync(trimmed)
      onProposal(trimmed, proposal)
      setText('')
    } catch {
      // error surfaces via extract.error
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      handleSubmit()
    }
  }

  const disabled = !text.trim() || extract.isPending || busy || offline
  const errorMessage = extract.error?.message ?? null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-6 flex justify-center">
      <div className="pointer-events-auto w-full max-w-2xl">
        {errorMessage && (
          <div className="mb-2 px-3 py-2 bg-red-50/95 border border-red-200 rounded-lg text-xs text-red-800 shadow-sm">
            {errorMessage}
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
          className="flex items-end gap-2 bg-paper-50/90 border border-ink-100/80 rounded-2xl shadow-xl shadow-ink-900/10 p-2 backdrop-blur-md transition-shadow duration-300 focus-within:shadow-2xl focus-within:shadow-ink-900/15 focus-within:border-ink-200"
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="¿en qué andabas pensando? un libro, una idea suelta, una conversación…"
            rows={1}
            disabled={extract.isPending || busy}
            className="flex-1 resize-none bg-transparent px-3 py-2 text-ink-700 placeholder:text-ink-300 focus:outline-none leading-relaxed"
          />
          <button
            type="submit"
            disabled={disabled}
            aria-label="Extraer"
            className="self-end mb-1 mr-1 size-9 rounded-full bg-ink-700 text-paper-50 hover:bg-ink-600 active:scale-90 disabled:bg-ink-100 disabled:text-ink-300 disabled:active:scale-100 transition-all duration-150 ease-out flex items-center justify-center"
            title="Extraer (⌘/Ctrl+Enter)"
          >
            {extract.isPending ? (
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
