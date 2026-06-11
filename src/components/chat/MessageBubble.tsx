import { useState } from 'react'
import type { ChatMessage } from '../../api'
import { AISourceTag } from '../AISourceTag'
import { EssayOverlay } from './EssayOverlay'
import { InlineProposal } from './InlineProposal'

/** Largo desde el cual una respuesta deja de ser "mensaje" y pide página
 *  propia. ~700 chars ≈ tres párrafos — donde el bubble empieza a pesar. */
const ESSAY_THRESHOLD = 700

/**
 * Un mensaje del chat: user (sans, ink-on-paper) o assistant (Spectral
 * serif sobre fondo papel con textura sutil). El cambio de registro
 * tipográfico señala que la respuesta es "voz de catálogo", no
 * conversación cotidiana.
 *
 * Marginal con timestamp en italic serif (estilo nota al margen). Si
 * el mensaje del assistant trae modelo/provider, el AISourceTag los
 * muestra detrás de un icono que se revela al hover — la info sigue
 * accesible sin ensuciar la página.
 *
 * Si el assistant trae `proposal`, lo renderizamos como InlineProposal
 * adjunto al final del bubble.
 */
export function MessageBubble({
  message,
  threadTitle,
}: {
  message: ChatMessage
  /** Cabecera del ensayo al abrir una respuesta larga como página. */
  threadTitle?: string | null
}) {
  const isUser = message.role === 'user'
  const ts = formatTimestamp(message.createdAt)
  const [essayOpen, setEssayOpen] = useState(false)
  // `content` defensivo: durante streaming el placeholder puede venir vacío.
  const essayable = !isUser && (message.content?.length ?? 0) >= ESSAY_THRESHOLD
  return (
    <li className={isUser ? 'flex flex-col items-end' : 'flex flex-col items-start'}>
      <div
        className={
          isUser
            ? 'self-end max-w-[75%] px-3 py-2 bg-ink-700 text-paper-50 rounded-xl rounded-br-md text-sm leading-relaxed whitespace-pre-wrap'
            : 'max-w-[80%] px-4 py-3 bubble-paper border border-ink-100/50 text-ink-700 rounded-xl rounded-bl-md font-serif text-lead leading-relaxed'
        }
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
        {!isUser && message.proposal && <InlineProposal proposal={message.proposal} />}
      </div>
      {essayable && (
        <button
          onClick={() => setEssayOpen(true)}
          className="mt-1 ml-1 self-start text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700 transition-colors"
        >
          abrir como ensayo
        </button>
      )}
      {essayOpen && (
        <EssayOverlay
          content={message.content}
          title={threadTitle}
          onClose={() => setEssayOpen(false)}
        />
      )}
      {(ts || (!isUser && message.model)) && (
        <span
          className={`mt-1 inline-flex items-center gap-1.5 text-micro tracking-normal text-ink-300/80 font-serif italic ${
            isUser ? 'self-end mr-1' : 'self-start ml-1'
          }`}
        >
          {ts && <span>{ts}</span>}
          {!isUser && (message.model || message.provider) && (
            <AISourceTag
              provider={message.provider}
              model={message.model}
              at={message.createdAt}
            />
          )}
        </span>
      )}
    </li>
  )
}

/**
 * Timestamp humano para el marginal del bubble:
 *   - hoy → HH:MM
 *   - antes → "dd mmm HH:MM"
 *
 * Si no hay createdAt válido, vacío (no decimos "Invalid Date").
 */
function formatTimestamp(createdAt: string | undefined | null): string {
  if (!createdAt) return ''
  const d = new Date(createdAt)
  if (Number.isNaN(d.getTime())) return ''
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
}
