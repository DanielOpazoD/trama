import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import type { ExtractionProposal } from '../types'
import { CloseIcon, SparkleIcon } from './Icons'
import { ProgressBar } from './ProgressBar'

/**
 * Modo lectura: el usuario pega un texto largo (un capítulo, una entrevista,
 * un ensayo) y la IA lo procesa por trozos. Cada trozo produce su propia
 * propuesta; al final se fusionan en una sola que el usuario revisa.
 *
 * Diseño:
 *  - Chunks de ~3000 chars, partiendo en límites de párrafo (\n\n) cuando es
 *    posible, para no cortar oraciones.
 *  - Llamadas secuenciales a /api/extract (paralelizar haría doble costo y
 *    riesgo de rate-limit; secuencial deja ver progreso).
 *  - Dedupe en cliente: si dos chunks proponen la misma entidad por nombre
 *    + tipo, se fusiona; lo mismo para relaciones y citas.
 *  - El usuario puede cancelar a mitad. Lo extraído hasta ese punto sigue
 *    disponible como propuesta.
 *
 * Roadmap (no aquí): aceptar PDF vía pdfjs-dist, dividir por páginas.
 */

const CHUNK_TARGET_CHARS = 3000
// Don't bother chunking if the text is shorter than this — just one call.
const SINGLE_CALL_THRESHOLD = 4500

function chunkText(text: string, target = CHUNK_TARGET_CHARS): string[] {
  const trimmed = text.trim()
  if (trimmed.length <= SINGLE_CALL_THRESHOLD) return [trimmed]

  // Split into paragraphs first, then greedily concatenate up to target.
  const paragraphs = trimmed
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  const chunks: string[] = []
  let buf = ''
  for (const p of paragraphs) {
    if (buf.length + p.length + 2 > target && buf.length > 0) {
      chunks.push(buf)
      buf = p
    } else {
      buf = buf ? `${buf}\n\n${p}` : p
    }
  }
  if (buf) chunks.push(buf)

  // Final safety: if any single paragraph was longer than target, hard-split.
  const out: string[] = []
  for (const c of chunks) {
    if (c.length <= target * 1.5) {
      out.push(c)
    } else {
      for (let i = 0; i < c.length; i += target) {
        out.push(c.slice(i, i + target))
      }
    }
  }
  return out
}

/**
 * Merge proposals from multiple chunks by deduplicating on name/preview.
 * Edits and deletes are kept as-is (they reference real UUIDs so dups are
 * unlikely; if they happen, harmless).
 */
function mergeProposals(parts: ExtractionProposal[]): ExtractionProposal {
  const entityKey = (e: { name: string; type: string }) =>
    `${e.name.trim().toLowerCase()}|${e.type}`
  const relKey = (r: { fromName: string; toName: string; type: string }) =>
    `${r.fromName.trim().toLowerCase()}|${r.type}|${r.toName.trim().toLowerCase()}`
  const quoteKey = (q: { entityName: string; text: string }) =>
    `${q.entityName.trim().toLowerCase()}|${q.text.trim().toLowerCase().slice(0, 80)}`

  const entitiesByKey = new Map<string, ExtractionProposal['entities'][number]>()
  const relsByKey = new Map<string, ExtractionProposal['relationships'][number]>()
  const quotesByKey = new Map<string, ExtractionProposal['quotes'][number]>()
  const edits: ExtractionProposal['edits'] = []
  const deletes: ExtractionProposal['deletes'] = []

  for (const p of parts) {
    for (const e of p.entities) entitiesByKey.set(entityKey(e), e)
    for (const r of p.relationships) relsByKey.set(relKey(r), r)
    for (const q of p.quotes) quotesByKey.set(quoteKey(q), q)
    if (p.edits) edits.push(...p.edits)
    if (p.deletes) deletes.push(...p.deletes)
  }

  return {
    entities: Array.from(entitiesByKey.values()),
    relationships: Array.from(relsByKey.values()),
    quotes: Array.from(quotesByKey.values()),
    edits: edits.length > 0 ? edits : undefined,
    deletes: deletes.length > 0 ? deletes : undefined,
    // Carry through provider/model of the LAST chunk (they should all be the same).
    provider: parts[parts.length - 1]?.provider,
    model: parts[parts.length - 1]?.model,
  }
}

export function ReadingMode({
  open,
  onClose,
  onProposal,
}: {
  open: boolean
  onClose: () => void
  onProposal: (text: string, proposal: ExtractionProposal) => void
}) {
  const [text, setText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [chunkIdx, setChunkIdx] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const cancelRef = useRef(false)

  // Reset state every time the modal opens.
  useEffect(() => {
    if (open) {
      setText('')
      setError(null)
      setChunkIdx(0)
      setTotalChunks(0)
      setProcessing(false)
      cancelRef.current = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !processing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, processing, onClose])

  async function handleStart() {
    const trimmed = text.trim()
    if (!trimmed || processing) return
    cancelRef.current = false
    setError(null)
    setProcessing(true)
    const chunks = chunkText(trimmed)
    setTotalChunks(chunks.length)
    setChunkIdx(0)
    const collected: ExtractionProposal[] = []
    try {
      for (let i = 0; i < chunks.length; i++) {
        if (cancelRef.current) break
        setChunkIdx(i + 1)
        const proposal = await api.extract(chunks[i]!)
        collected.push(proposal)
      }
      if (collected.length > 0) {
        const merged = mergeProposals(collected)
        // Preview text for the proposal panel header: first 80 chars + chunk count.
        const summary =
          chunks.length === 1
            ? trimmed.slice(0, 80)
            : `${chunks.length} fragmentos · ${trimmed.slice(0, 60)}…`
        onProposal(summary, merged)
        onClose()
      } else if (cancelRef.current) {
        onClose()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setProcessing(false)
    }
  }

  function handleCancel() {
    if (processing) {
      cancelRef.current = true
    } else {
      onClose()
    }
  }

  if (!open) return null

  const chunks = text.trim() ? chunkText(text) : []
  const estimatedChunks = chunks.length

  return (
    <>
      <button
        onClick={handleCancel}
        aria-label="Cerrar"
        className="fixed inset-0 z-30 bg-ink-900/30 backdrop-blur-sm cursor-default"
        tabIndex={-1}
      />
      <div className="fixed inset-x-4 top-12 bottom-12 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[680px] md:max-w-[calc(100vw-2rem)] z-40 flex flex-col rounded-xl border border-ink-100/50 bg-paper-50/95 backdrop-blur-md shadow-lg shadow-ink-900/10 overflow-hidden animate-slide-up">
        <header className="px-5 py-4 border-b border-ink-100/60 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-micro uppercase tracking-eyebrow text-ink-300 flex items-center gap-1.5">
              <SparkleIcon size={12} />
              modo lectura
            </p>
            <h2 className="font-serif text-lg text-ink-700 mt-0.5">
              Pega un texto largo
            </h2>
            <p className="mt-1 text-xs text-ink-400 leading-relaxed">
              Lo dividiré en partes y propondré una sola extracción al final con todo lo
              que valga la pena guardar. Sirve para capítulos, entrevistas, ensayos.
            </p>
          </div>
          <button
            onClick={handleCancel}
            aria-label="Cerrar"
            className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors shrink-0"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Pega aquí el texto. Cuanto más, mejor — la IA lo procesa por trozos."
            disabled={processing}
            rows={12}
            className="input-paper w-full resize-none font-serif leading-relaxed"
            autoFocus
          />
          {text.trim() && !processing && (
            <p className="text-xs text-ink-400 leading-relaxed">
              {text.trim().length.toLocaleString('es')} caracteres ·{' '}
              {estimatedChunks === 1
                ? 'una sola llamada al modelo'
                : `${estimatedChunks} llamadas al modelo`}
            </p>
          )}
          {processing && (
            <ProgressBar
              label="Procesando fragmento"
              current={chunkIdx}
              total={totalChunks}
              hint={
                chunkIdx === totalChunks
                  ? 'unificando propuestas…'
                  : 'el LLM lee un trozo a la vez'
              }
            />
          )}
          {error && <p className="text-xs text-red-700 leading-relaxed">{error}</p>}
        </div>

        <footer className="px-5 py-4 border-t border-ink-100/60 flex items-baseline justify-between gap-3">
          <p className="text-xs text-ink-400">
            {processing
              ? 'Puedes cancelar y conservar lo extraído hasta este punto.'
              : 'Cada fragmento ≈ 3.000 caracteres. La propuesta final unifica todo.'}
          </p>
          <div className="flex items-baseline gap-3 shrink-0">
            {processing ? (
              <button
                onClick={() => {
                  cancelRef.current = true
                }}
                className="text-xs uppercase tracking-eyebrow text-ink-400 hover:text-ink-700 transition-colors"
              >
                cancelar
              </button>
            ) : (
              <button
                onClick={onClose}
                className="text-xs uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
              >
                cerrar
              </button>
            )}
            <button
              onClick={handleStart}
              disabled={!text.trim() || processing}
              className="btn-accent text-xs"
            >
              {processing ? 'leyendo…' : 'leer y proponer'}
            </button>
          </div>
        </footer>
      </div>
    </>
  )
}
