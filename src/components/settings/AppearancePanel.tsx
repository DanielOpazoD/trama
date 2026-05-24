import { MoonIcon, SunIcon } from '../Icons'
import { PanelHeader } from './_shared'

/**
 * ν3: tres temas — paper (día), night (noche frío), vela (noche cálido).
 * Cada uno botón propio. setTheme directo en vez de toggle binario.
 */
export function AppearancePanel({
  theme,
  onSetTheme,
}: {
  theme: 'paper' | 'night' | 'vela'
  onSetTheme: (t: 'paper' | 'night' | 'vela') => void
}) {
  return (
    <section>
      <PanelHeader
        title="Apariencia"
        hint="Papel para el día. Noche para luz baja. Vela para lectura nocturna con tinte cálido. La elección se recuerda en este navegador."
      />
      <div className="flex gap-2 p-1 bg-paper-100/60 rounded-lg border border-ink-100/50 w-fit">
        <button
          onClick={() => onSetTheme('paper')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all duration-150 ${
            theme === 'paper'
              ? 'bg-paper-50 text-ink-700 shadow-sm'
              : 'text-ink-400 hover:text-ink-700'
          }`}
        >
          <SunIcon size={14} />
          Papel
        </button>
        <button
          onClick={() => onSetTheme('night')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all duration-150 ${
            theme === 'night'
              ? 'bg-paper-50 text-ink-700 shadow-sm'
              : 'text-ink-400 hover:text-ink-700'
          }`}
        >
          <MoonIcon size={14} />
          Noche
        </button>
        <button
          onClick={() => onSetTheme('vela')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all duration-150 ${
            theme === 'vela'
              ? 'bg-paper-50 text-ink-700 shadow-sm'
              : 'text-ink-400 hover:text-ink-700'
          }`}
          title="Sepia cálido para lectura nocturna"
        >
          {/* SVG inline de una vela mínima — no vale la pena agregarlo a
              Icons.tsx hasta que se reuse. */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 4c-0.8 1.4-1.5 2.2-1.5 3.2 0 1 0.7 1.8 1.5 1.8s1.5-0.8 1.5-1.8c0-1-0.7-1.8-1.5-3.2z" fill="currentColor" fillOpacity="0.4" />
            <rect x="9.5" y="9" width="5" height="11" rx="0.6" />
            <path d="M10 13h4M10 17h4" strokeOpacity="0.4" />
          </svg>
          Vela
        </button>
      </div>
    </section>
  )
}
