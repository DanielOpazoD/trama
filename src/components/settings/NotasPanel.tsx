import { PanelHeader } from './_shared'
import { SECTIONS } from '../notas/notasSections'
import { useModuleVisibility } from '../../hooks/useModuleVisibility'
import { useUserPrefs, useSaveUserPrefs } from '../../state'
import { DEFAULT_WORLD, type World } from '../../types/world'

const ACCENT = 'var(--accent-sage)'
const WORLDS: { key: World; label: string }[] = [
  { key: 'trama', label: 'Trama' },
  { key: 'notas', label: 'Notas' },
]

/**
 * Personalización del mundo Notas (sincronizada entre dispositivos vía
 * `user_prefs`): qué subsecciones se ven y qué mundo abre por defecto.
 */
export function NotasPanel() {
  const { isVisible, isHideable, setVisible, showAll } = useModuleVisibility()
  const { data } = useUserPrefs()
  const save = useSaveUserPrefs()
  const defaultWorld = data?.defaultWorld ?? DEFAULT_WORLD

  return (
    <section className="space-y-6">
      <div>
        <PanelHeader
          title="Secciones de Notas"
          hint="Elegí qué subsecciones del mundo Notas se ven en la barra. Inicio siempre está. Una sección oculta sigue siendo accesible desde Configuración o con un comando en el buscador."
        />
        <div className="card-segment flex flex-col">
          {SECTIONS.map((s) => {
            const locked = !isHideable(s.id)
            const on = isVisible(s.id)
            return (
              <button
                key={s.id}
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`Sección ${s.label}`}
                disabled={locked}
                onClick={() => setVisible(s.id, !on)}
                className="flex items-center justify-between gap-3 w-full text-left px-2 py-1.5 rounded-md hover:bg-ink-100/50 disabled:opacity-60 disabled:hover:bg-transparent transition-colors"
              >
                <span className="flex items-center gap-2 text-sm text-ink-700">
                  <s.icon size={14} className="text-ink-400" />
                  {s.label}
                  {locked && (
                    <span className="text-micro text-ink-300">siempre visible</span>
                  )}
                </span>
                <span
                  className={`text-micro uppercase tracking-eyebrow ${
                    on ? '' : 'text-ink-300'
                  }`}
                  style={on && !locked ? { color: ACCENT } : undefined}
                >
                  {on ? 'visible' : 'oculta'}
                </span>
              </button>
            )
          })}
        </div>
        <button onClick={showAll} className="btn-ghost text-xs mt-2">
          Mostrar todo
        </button>
      </div>

      <div>
        <PanelHeader
          title="Mundo por defecto"
          hint="Con qué mundo abre la app en un navegador nuevo. Si ya estuviste antes, Trama recuerda dónde estabas."
        />
        <div className="card-segment flex gap-2">
          {WORLDS.map((w) => (
            <button
              key={w.key}
              onClick={() => save.mutate({ defaultWorld: w.key })}
              className={`px-3 py-1.5 rounded text-sm transition-all duration-150 ${
                defaultWorld === w.key
                  ? 'bg-paper-50 text-ink-700 shadow-sm'
                  : 'text-ink-400 hover:text-ink-700'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
