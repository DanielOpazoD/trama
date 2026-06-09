import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAsk, useExtractFromImage, useOffline } from '../state'
import type { ExtractionProposal } from '../types'
import { useThreadIdForView } from '../hooks/useThreadIdForView'
import { ArrowRightIcon, CameraIcon, ReadingIcon } from './Icons'
import { Tooltip } from './Tooltip'
import { AISourceTag } from './AISourceTag'

/** Convert a File to a base64 string (without the data URL prefix). */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('No se pudo leer el archivo'))
        return
      }
      const commaIdx = result.indexOf(',')
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Error de FileReader'))
    reader.readAsDataURL(file)
  })
}

type Reply = {
  text: string
  /** Where the reply came from — shown discreetly so user knows which model spoke. */
  provider?: string
  model?: string
}

/**
 * Universal "ask" bar. Replaces the old extract-only bar.
 *
 * The user types anything. The backend decides:
 *   • capture → extracts and offers a proposal via onProposal()
 *   • question / conversation → returns prose, shown as an inline reply
 *   • mixed → both: shows reply AND offers a proposal
 *
 * Context (current view + selected entity) is passed so the model can adapt
 * its tone — meditative when reading quotes, technical when editing graph,
 * etc.
 */
export function AskBar({
  view,
  selectedEntityId,
  onProposal,
  busy,
  onOpenThread,
  onOpenReading,
}: {
  view: string | null
  selectedEntityId: string | null
  onProposal: (text: string, proposal: ExtractionProposal) => void
  busy: boolean
  /** Navigate to ChatView with this thread pre-opened. AskBar calls it via
      the "ver historial" link when there's an active section thread. */
  onOpenThread?: (threadId: string) => void
  /** Opens the reading-mode modal for long-text chunked extraction. */
  onOpenReading?: () => void
}) {
  const ask = useAsk()
  const extractFromImage = useExtractFromImage()
  const { offline } = useOffline()
  const [text, setText] = useState('')
  const [reply, setReply] = useState<Reply | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Section-scoped thread memory. Each section (Citas, Entidades, etc.)
  // keeps its own active thread so the AskBar can follow up across turns.
  const { threadId, setThreadId } = useThreadIdForView(view)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  // Clear the reply when the user changes view — it was attached to a
  // particular context that no longer applies.
  useEffect(() => {
    setReply(null)
  }, [view])

  async function handleSubmit(event?: FormEvent) {
    event?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || ask.isPending || busy) return
    try {
      const result = await ask.mutateAsync({
        text: trimmed,
        view,
        selectedEntityId,
        threadId,
      })
      // The server may have created a thread if this was the first turn in
      // the section. Persist whatever id came back so the next Enter chains.
      if (result.threadId && result.threadId !== threadId) {
        setThreadId(result.threadId)
      }
      if (result.reply) {
        setReply({ text: result.reply, provider: result.provider, model: result.model })
      } else {
        setReply(null)
      }
      if (result.proposal) {
        // If there's both a reply and a proposal we still hand the proposal
        // to the side panel — the user sees the reply in the bar AND has
        // the items to accept on the right.
        onProposal(trimmed, result.proposal)
      }
      setText('')
    } catch {
      // error surfaces via ask.error
    }
  }

  function handleNewThread() {
    setThreadId(null)
    setReply(null)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envía. Shift+Enter inserta salto de línea. Coherente con ChatView.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }

  async function handleImageSelected(file: File) {
    setImageError(null)
    if (file.size > 8 * 1024 * 1024) {
      setImageError(
        'La imagen excede los 8 MB. Toma una foto más pequeña o redimensiona.',
      )
      return
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setImageError(`Formato no soportado: ${file.type || 'desconocido'}.`)
      return
    }
    try {
      const base64 = await fileToBase64(file)
      const proposal = await extractFromImage.mutateAsync({
        imageBase64: base64,
        mimeType: file.type,
      })
      onProposal(`📷 ${file.name}`, proposal)
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Error procesando la imagen')
    }
  }

  const disabled = !text.trim() || ask.isPending || busy || offline
  const errorMessage =
    ask.error?.message ?? extractFromImage.error?.message ?? imageError ?? null
  const imageBusy = extractFromImage.isPending

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 px-4 flex justify-center"
      // pb-6 + el inset del home indicator (0 fuera de iPhones con notch).
      style={{ paddingBottom: 'calc(1.5rem + var(--safe-bottom))' }}
    >
      <div className="pointer-events-auto w-full max-w-2xl">
        {errorMessage && (
          <div className="alert-error mb-2 px-3 py-2 text-xs shadow-sm">
            {errorMessage}
          </div>
        )}
        {offline && (
          <div className="alert-warn mb-2 px-3 py-2 text-xs shadow-sm">
            Sin backend — la IA no está disponible en modo local. Lo manual sí funciona
            desde las listas en la barra lateral.
          </div>
        )}
        {reply && (
          <div className="mb-2 px-4 py-3 bg-paper-50/95 border border-ink-100/80 rounded-xl shadow-xl shadow-ink-900/10 backdrop-blur-md animate-ai-arrive">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <span
                className="text-micro uppercase tracking-eyebrow inline-flex items-center gap-1.5"
                style={{ color: 'var(--accent-primary)' }}
              >
                <span
                  className="inline-block size-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--accent-primary)' }}
                />
                respuesta
                <AISourceTag provider={reply.provider} model={reply.model} size={11} />
              </span>
              <div className="flex items-baseline gap-3">
                {threadId && onOpenThread && (
                  <button
                    onClick={() => onOpenThread(threadId)}
                    className="section-eyebrow hover:text-ink-700 transition-colors"
                    title="Ver en chat"
                  >
                    Historial
                  </button>
                )}
                {threadId && (
                  <button
                    onClick={handleNewThread}
                    className="section-eyebrow hover:text-ink-700 transition-colors"
                    title="Empezar hilo nuevo"
                  >
                    Nuevo
                  </button>
                )}
                <button
                  onClick={() => setReply(null)}
                  className="section-eyebrow hover:text-ink-700 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
            <p className="text-ink-700 text-body leading-relaxed whitespace-pre-wrap">
              {reply.text}
            </p>
            {threadId && (
              <p className="mt-2 text-xs uppercase tracking-wider text-ink-400">
                Hilo activo
              </p>
            )}
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 bg-paper-50/90 border border-ink-100/80 rounded-xl shadow-xl shadow-ink-900/10 p-2 backdrop-blur-md transition-shadow duration-300 focus-within:shadow-lg focus-within:shadow-ink-900/10 focus-within:border-ink-200"
        >
          <Tooltip content="Sube una foto y la IA extrae lo que contiene">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={offline || imageBusy || busy}
              aria-label="Extraer desde imagen"
              className="self-end mb-1 ml-1 size-9 rounded-full text-ink-400 hover:text-ink-700 hover:bg-ink-50 disabled:text-ink-200 disabled:cursor-not-allowed transition-all duration-150 ease-out flex items-center justify-center"
            >
              {imageBusy ? (
                <span className="size-3.5 border-2 border-ink-200 border-t-ink-500 rounded-full animate-spin" />
              ) : (
                <CameraIcon size={14} />
              )}
            </button>
          </Tooltip>
          {onOpenReading && (
            <Tooltip content="Modo lectura — pega un texto largo y se procesa por trozos">
              <button
                type="button"
                onClick={onOpenReading}
                disabled={offline || busy}
                aria-label="Modo lectura"
                className="self-end mb-1 size-9 rounded-full text-ink-400 hover:text-ink-700 hover:bg-ink-50 disabled:text-ink-200 disabled:cursor-not-allowed transition-all duration-150 ease-out flex items-center justify-center"
              >
                <ReadingIcon size={14} />
              </button>
            </Tooltip>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleImageSelected(file)
              e.target.value = ''
            }}
          />
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholderForView(view)}
            rows={1}
            disabled={ask.isPending || busy || imageBusy}
            // ι3: font-serif para que el input se sienta como escribir
            // en un cuaderno, no en un form. El placeholder también
            // se beneficia (italic implícito en Spectral).
            className="flex-1 resize-none bg-transparent px-3 py-2 text-ink-700 placeholder:text-ink-300 placeholder:italic leading-relaxed font-serif text-base"
          />
          <button
            type="submit"
            disabled={disabled}
            aria-label="Enviar"
            className="self-end mb-1 mr-1 size-9 rounded-full bg-ink-700 text-paper-50 hover:bg-ink-600 active:scale-90 disabled:bg-ink-100 disabled:text-ink-300 disabled:active:scale-100 transition-all duration-150 ease-out flex items-center justify-center"
            title="Enviar (⌘/Ctrl+Enter)"
          >
            {ask.isPending ? (
              <span className="size-3.5 border-2 border-paper-50/40 border-t-paper-50 rounded-full animate-spin" />
            ) : (
              <ArrowRightIcon size={14} />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

function placeholderForView(view: string | null): string {
  // ι3: placeholders editoriales — cada vista invita en su propio idioma.
  // Español neutro (tú-form), sin voseo. "Propón" con tilde es la
  // imperativa tú del verbo proponer.
  switch (view) {
    case 'citas':
      return 'Ofrece una cita, una frase que quieres guardar…'
    case 'entidades':
      return 'Nombra a alguien, propón un vínculo, una idea…'
    case 'escuchas':
      return 'Pregunta o describe una música…'
    case 'sugerencias':
      return 'Pregunta a la IA sobre lo que ya tienes…'
    case 'grafo':
      return 'Pregunta, captura, navega…'
    default:
      return 'Captura algo, pregunta, propón…'
  }
}
