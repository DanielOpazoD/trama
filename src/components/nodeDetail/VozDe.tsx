import { useState } from 'react'
import { useQuotesQuery, useVoiceOfEntity, useToast } from '../../state'
import type { Entity } from '../../types'
import { SparkleIcon } from '../Icons'
import { AISourceTag } from '../AISourceTag'

/**
 * V-3 "Voz de…": para una entidad con al menos 5 citas reunidas, ofrece una
 * lectura activa — qué "diría" esa voz sobre un tema, construida SOLO con sus
 * citas.
 *
 * No es la persona real ni una atribución fiel: es una hipótesis de voz a
 * partir de un archivo parcial. El componente lo rotula explícitamente para
 * que nadie confunda la lectura con una cita.
 *
 * Gate: si la entidad tiene < 5 citas no renderiza nada (el server impone el
 * mismo mínimo con un 422 de respaldo).
 */

const MIN_QUOTES = 5

export function VozDe({ entity }: { entity: Entity }) {
  const { data: quotes = [] } = useQuotesQuery()
  const voice = useVoiceOfEntity()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<{
    text: string
    provider: string
    model: string
  } | null>(null)

  const quoteCount = quotes.filter((q) => q.entityId === entity.id).length
  if (quoteCount < MIN_QUOTES) return null

  async function handleAsk() {
    const q = question.trim()
    if (!q) return
    try {
      const res = await voice.mutateAsync({ id: entity.id, question: q })
      setAnswer({ text: res.voice, provider: res.provider, model: res.model })
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo generar la voz',
        tone: 'error',
      })
    }
  }

  if (!open) {
    return (
      <section>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-micro uppercase tracking-eyebrow text-[color:var(--accent-primary)] hover:text-[color:var(--accent-primary)] transition-colors"
          title={`Imagina qué diría ${entity.name} sobre un tema, a partir de sus citas. Es una lectura, no una cita.`}
        >
          <SparkleIcon size={10} />
          qué diría {entity.name.length < 24 ? entity.name : 'esta voz'}
        </button>
      </section>
    )
  }

  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="section-eyebrow-serif">voz de {entity.name}</h3>
        <button
          onClick={() => {
            setOpen(false)
            setAnswer(null)
            setQuestion('')
          }}
          className="ml-auto text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-500 transition-colors"
        >
          cerrar
        </button>
      </div>

      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="¿Sobre qué tema?"
        rows={2}
        className="input-paper w-full resize-none text-sm leading-relaxed"
        autoFocus
      />
      <div className="flex justify-end">
        <button
          onClick={handleAsk}
          disabled={voice.isPending || !question.trim()}
          className="btn-ink text-xs disabled:opacity-50"
        >
          {voice.isPending ? 'pensando…' : 'preguntar'}
        </button>
      </div>

      {answer && (
        <div className="animate-fade-up pt-1" aria-live="polite">
          <div className="flex items-baseline gap-1.5 text-micro uppercase tracking-eyebrow text-[color:var(--accent-primary)] mb-1">
            <SparkleIcon size={10} />
            <span>lectura activa · no es {entity.name}</span>
            <AISourceTag
              provider={answer.provider}
              model={answer.model}
              className="ml-auto"
            />
          </div>
          <p className="font-serif italic text-ink-600 text-sm leading-relaxed whitespace-pre-wrap border-l-2 border-[color:var(--accent-primary-ring)] pl-3">
            {answer.text}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={handleAsk}
              disabled={voice.isPending}
              className="section-eyebrow hover:text-ink-700 transition-colors disabled:opacity-60"
            >
              {voice.isPending ? 'pensando…' : 'otra'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
