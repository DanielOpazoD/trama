import { MoonIcon, SunIcon } from '../Icons'
import { PanelHeader } from './_shared'

export function AppearancePanel({
  theme,
  onToggleTheme,
}: {
  theme: 'paper' | 'night'
  onToggleTheme: () => void
}) {
  return (
    <section>
      <PanelHeader
        title="Apariencia"
        hint="Modo papel para el día, modo noche para horas tardías. La elección se recuerda en este navegador."
      />
      <div className="flex gap-2 p-1 bg-paper-100/60 rounded-lg border border-ink-100/50 w-fit">
        <button
          onClick={() => theme !== 'paper' && onToggleTheme()}
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
          onClick={() => theme !== 'night' && onToggleTheme()}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-all duration-150 ${
            theme === 'night'
              ? 'bg-paper-50 text-ink-700 shadow-sm'
              : 'text-ink-400 hover:text-ink-700'
          }`}
        >
          <MoonIcon size={14} />
          Noche
        </button>
      </div>
    </section>
  )
}
