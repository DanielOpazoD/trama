import { InfoIcon } from './Icons'
import { Tooltip } from './Tooltip'

/**
 * κ-info: chip discreto que expone el provider + modelo + (opcional)
 * timestamp / latencia detrás de una respuesta de la IA. Se ancla como
 * un icono "i" 10–12px de text-ink-300 que sólo cobra opacidad al
 * hover/focus. El tooltip muestra los metadatos formateados.
 *
 * Pensado para reutilizarse en:
 *   - Bubbles assistant en ChatView
 *   - Header de InlineProposal (extract / suggest / reclassify)
 *   - Bloque de reflexión IA en QuotesView (κ6)
 *   - Cards de sugerencias proactivas (κ2)
 *
 * Si no hay provider Y no hay model, no renderiza nada (silencioso) —
 * permite usarlo en lugares donde la metadata es opcional sin checks
 * en cada call site.
 *
 * Diseño deliberado: NO mostrar nada visible salvo el icono. El usuario
 * que se pregunta "qué modelo respondió esto" tiene la respuesta a un
 * hover; el resto del tiempo es invisible y no contamina la página.
 */

const PROVIDER_LABELS: Record<string, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  google: 'Google',
  mistral: 'Mistral',
  unknown: '—',
}

function formatProvider(p?: string | null): string {
  if (!p) return ''
  const key = p.toLowerCase()
  return PROVIDER_LABELS[key] ?? p
}

function formatTimestamp(at?: string | null): string {
  if (!at) return ''
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('es', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
}

export function AISourceTag({
  provider,
  model,
  at,
  className = '',
  size = 12,
  /** Si true, además del icono muestra el modelo en uppercase mono a la
      derecha (para los lugares donde queremos discoverability extra,
      como InlineProposal). Default false: sólo icono. */
  showModelInline = false,
}: {
  provider?: string | null
  model?: string | null
  at?: string | null
  className?: string
  size?: number
  showModelInline?: boolean
}) {
  if (!provider && !model) return null

  const providerLabel = formatProvider(provider)
  const ts = formatTimestamp(at)

  const tooltipContent = (
    <div className="text-left max-w-[14rem]">
      <div className="text-micro tracking-eyebrow uppercase text-paper-200/80 mb-0.5">
        respondió
      </div>
      <div className="font-mono text-caption text-paper-50 break-all">
        {model ?? '—'}
      </div>
      {providerLabel && (
        <div className="text-micro text-paper-200/80 mt-0.5">{providerLabel}</div>
      )}
      {ts && (
        <div className="text-micro italic text-paper-200/70 mt-1 font-serif">{ts}</div>
      )}
    </div>
  )

  return (
    <Tooltip content={tooltipContent}>
      <span
        className={`inline-flex items-center gap-1 align-middle text-ink-300/70 hover:text-ink-500 focus-visible:text-ink-500 focus-visible:outline-none transition-colors cursor-help ${className}`}
        tabIndex={0}
        role="button"
        aria-label={
          model
            ? `Generado por ${providerLabel || provider} · ${model}`
            : `Generado por IA${providerLabel ? ` (${providerLabel})` : ''}`
        }
      >
        <InfoIcon size={size} />
        {showModelInline && model && (
          <span className="font-mono text-micro tracking-wider uppercase">{model}</span>
        )}
      </span>
    </Tooltip>
  )
}
