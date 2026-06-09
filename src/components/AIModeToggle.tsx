import { useEffect, useRef, useState } from 'react'
import { useAIMode, type AIMode } from '../hooks/useAIMode'
import { CheckIcon } from './Icons'
import { MODELS_BY_PROVIDER } from '../lib/aiModels'

/**
 * Global AI activation toggle. Three semantic states:
 *   • Auto      — each task uses its configured provider (default)
 *   • Off       — block all AI calls (server returns 423)
 *   • Forzado:X — every AI action goes through provider X
 *
 * Lives in the sidebar. Click opens a small popover with the options.
 * Persists in localStorage via useAIMode. Inject as the X-AI-Mode header
 * by api.ts on every request.
 */

const OPTIONS: ReadonlyArray<{ value: AIMode; label: string; hint?: string }> = [
  { value: 'auto', label: 'Auto', hint: 'cada tarea usa su provider configurado' },
  { value: 'off', label: 'Off', hint: 'bloquea todas las llamadas IA' },
  {
    value: 'forced-deepseek',
    label: 'Forzar DeepSeek',
    hint: 'todas las acciones via DeepSeek',
  },
  {
    value: 'forced-openai',
    label: 'Forzar OpenAI',
    hint: 'todas las acciones via OpenAI',
  },
  {
    value: 'forced-anthropic',
    label: 'Forzar Anthropic',
    hint: 'todas las acciones via Anthropic',
  },
  {
    value: 'forced-gemini',
    label: 'Forzar Gemini',
    hint: 'todas las acciones via Gemini',
  },
]

function labelFor(mode: AIMode): string {
  return OPTIONS.find((o) => o.value === mode)?.label ?? 'Auto'
}

export function AIModeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { mode, setMode, model, setModel } = useAIMode()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  // Click outside / Escape closes the popover.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const isOff = mode === 'off'
  const isForced = mode.startsWith('forced-')
  const stateLabel = labelFor(mode)
  // El visible muestra "IA AUTO" (dos spans separados). El title con dos
  // puntos queda bien para tooltip, pero el aria-label se compara contra el
  // texto visible — axe pide que sea un superset. Sin los dos puntos cumple
  // sin perder claridad.
  const title = `IA: ${stateLabel}`
  const ariaLabel = `IA ${stateLabel}`

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        className={
          collapsed
            ? 'p-2 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded-md transition-colors relative'
            : 'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-body text-ink-500 hover:text-ink-800 hover:bg-ink-100/60 transition-colors'
        }
      >
        <span className={collapsed ? 'inline-flex' : 'flex items-center gap-2.5'}>
          <ModeIcon mode={mode} />
          {!collapsed && <span>IA</span>}
        </span>
        {!collapsed && (
          <span
            className="text-micro uppercase tracking-wider tabular-nums"
            style={
              isOff
                ? { color: 'rgb(var(--ink-400))' }
                : isForced
                  ? { color: 'var(--accent-gold)' }
                  : { color: 'var(--accent-primary)' }
            }
          >
            {isOff ? 'off' : isForced ? mode.slice('forced-'.length) : 'auto'}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={
            collapsed
              ? 'absolute left-full ml-2 bottom-0 w-56 z-40 max-h-[70vh] overflow-y-auto paper-grain rounded-xl border border-ink-100/60 bg-paper-50/95 backdrop-blur-md shadow-lg shadow-ink-900/10 p-1.5'
              : 'absolute left-0 right-0 bottom-full mb-2 z-40 max-h-[60vh] overflow-y-auto paper-grain rounded-xl border border-ink-100/60 bg-paper-50/95 backdrop-blur-md shadow-lg shadow-ink-900/10 p-1.5'
          }
        >
          <p className="px-2 pt-1 pb-1.5 text-micro uppercase tracking-eyebrow text-ink-300">
            Modo IA
          </p>
          <ul className="space-y-0.5">
            {OPTIONS.map((opt) => {
              const active = mode === opt.value
              const isForcedProvider = opt.value.startsWith('forced-')
              const providerKey = isForcedProvider
                ? opt.value.slice('forced-'.length)
                : null
              const modelChoices = providerKey
                ? (MODELS_BY_PROVIDER[providerKey] ?? [])
                : []
              return (
                <li key={opt.value}>
                  {/* δ-fix: destacado neutral (ink suave + check), no el relleno
                      azul accent-primary que chocaba con el papel. */}
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      setMode(opt.value)
                      // Al forzar un provider dejamos el popover abierto para
                      // elegir el modelo; en auto/off cerramos.
                      if (!opt.value.startsWith('forced-')) setOpen(false)
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                      active
                        ? 'bg-ink-100/70 text-ink-800 font-medium'
                        : 'text-ink-600 hover:text-ink-800 hover:bg-ink-100/50'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {active && <CheckIcon size={12} className="text-ink-500 shrink-0" />}
                  </button>
                  {opt.hint && !active && (
                    <p className="px-2.5 pb-0.5 text-micro text-ink-300 leading-tight">
                      {opt.hint}
                    </p>
                  )}
                  {/* Sub-selector de modelo: aparece bajo el provider forzado
                      activo. Reusa la lista compartida de aiModels.ts. */}
                  {active && isForcedProvider && modelChoices.length > 0 && (
                    <div className="mt-1 mb-1 ml-3 pl-2.5 border-l border-ink-100 space-y-px">
                      <p className="px-1.5 pt-0.5 pb-0.5 text-micro uppercase tracking-eyebrow text-ink-300/90">
                        Modelo
                      </p>
                      {modelChoices.map((m) => {
                        const on = model === m.value
                        return (
                          <button
                            key={m.value || 'default'}
                            type="button"
                            role="menuitemradio"
                            aria-checked={on}
                            title={m.notes}
                            onClick={() => {
                              setModel(m.value)
                              setOpen(false)
                            }}
                            className={`w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded text-caption transition-colors ${
                              on
                                ? 'text-ink-800 font-medium'
                                : 'text-ink-500 hover:text-ink-800 hover:bg-ink-100/50'
                            }`}
                          >
                            <span className="truncate">{m.label}</span>
                            {on && (
                              <CheckIcon size={12} className="text-ink-500 shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

/**
 * Sparkle variants that read at a glance:
 *   auto   — full sparkle, accent-primary
 *   off    — muted sparkle with a slash, ink-300
 *   forced — sparkle with a small filled badge in accent-gold
 */
function ModeIcon({ mode }: { mode: AIMode }) {
  const size = 15
  const off = mode === 'off'
  const forced = mode.startsWith('forced-')
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        color: off
          ? 'rgb(var(--ink-300))'
          : forced
            ? 'var(--accent-gold)'
            : 'var(--accent-primary)',
      }}
    >
      <path
        d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
        opacity={off ? 0.55 : 1}
      />
      {off && <path d="M5 19L19 5" strokeWidth={1.7} />}
      {forced && <circle cx="18.5" cy="5.5" r="2.4" fill="currentColor" stroke="none" />}
    </svg>
  )
}
