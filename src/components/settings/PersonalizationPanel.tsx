import { useState } from 'react'
import { PanelHeader } from './_shared'
import { SECTIONS } from '../notas/notasSections'
import { useModuleVisibility } from '../../hooks/useModuleVisibility'
import { useSectionVisibility } from '../../hooks/useSectionVisibility'
import { useSectionPin } from '../../hooks/useSectionPin'
import { useSectionAlias } from '../../hooks/useSectionAlias'
import { useUserPrefs, useSaveUserPrefs } from '../../state'
import { isPinEnabled } from '../AppPinGate'
import { DEFAULT_WORLD, type World } from '../../types/world'
import type { ViewMode } from '../../types/view'
import {
  ChatIcon,
  AtlasIcon,
  CronologiaIcon,
  EntitiesIcon,
  GraphIcon,
  HomeIcon,
  LockIcon,
  MomentosIcon,
  MusicIcon,
  QuoteIcon,
  SparkleIcon,
  TwitterIcon,
} from '../Icons'
import { IconButton } from '../IconButton'

const ACCENT_TRAMA = 'var(--accent-primary)'
const ACCENT_NOTAS = 'var(--accent-sage)'

type WorldTab = 'trama' | 'notas'

const WORLDS: { key: World; label: string }[] = [
  { key: 'trama', label: 'Trama' },
  { key: 'notas', label: 'Notas' },
]

// ────── Trama sections ──────

type TramaSectionMeta = {
  id: ViewMode
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

const TRAMA_SECTIONS: TramaSectionMeta[] = [
  { id: 'inicio', label: 'Inicio', icon: HomeIcon },
  { id: 'entidades', label: 'Entidades', icon: EntitiesIcon },
  { id: 'citas', label: 'Citas', icon: QuoteIcon },
  { id: 'momentos', label: 'Momentos', icon: MomentosIcon },
  { id: 'escuchas', label: 'Escuchas', icon: MusicIcon },
  { id: 'twitter', label: 'Twitter', icon: TwitterIcon },
  { id: 'grafo', label: 'Grafo', icon: GraphIcon },
  { id: 'cronologia', label: 'Cronología', icon: CronologiaIcon },
  { id: 'atlas', label: 'Atlas', icon: AtlasIcon },
  { id: 'chat', label: 'Chat', icon: ChatIcon },
  { id: 'sugerencias', label: 'Sugerencias', icon: SparkleIcon },
]

/**
 * Panel unificado de personalización: visibilidad por sección (Trama + Notas),
 * protección con PIN por sección, y mundo default.
 */
export function PersonalizationPanel() {
  const [tab, setTab] = useState<WorldTab>('trama')
  const moduleVis = useModuleVisibility()
  const sectionVis = useSectionVisibility()
  const { isPinRequired, setPinRequired } = useSectionPin()
  const { getAlias, setAlias } = useSectionAlias()
  const { data } = useUserPrefs()
  const save = useSaveUserPrefs()
  const defaultWorld = data?.defaultWorld ?? DEFAULT_WORLD
  const pinEnabled = isPinEnabled()

  return (
    <section className="space-y-6">
      <div>
        <PanelHeader
          title="Secciones"
          hint="Elige qué secciones se ven en la barra de cada mundo. Una sección oculta sigue siendo accesible con un comando en el buscador (⌘K)."
        />
        {/* Tabs */}
        <div className="flex gap-1 mb-3">
          {(['trama', 'notas'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded text-sm transition-all duration-150 ${
                tab === t
                  ? 'bg-paper-50 text-ink-700 shadow-sm font-medium'
                  : 'text-ink-400 hover:text-ink-700'
              }`}
            >
              {t === 'trama' ? 'Trama' : 'Notas'}
            </button>
          ))}
        </div>

        {/* Trama sections */}
        {tab === 'trama' && (
          <div className="card-segment flex flex-col animate-fade-up">
            {TRAMA_SECTIONS.map((s) => {
              const on = sectionVis.isVisible(s.id)
              const pinned = isPinRequired(s.id)
              return (
                <SectionRow
                  key={s.id}
                  icon={s.icon}
                  label={s.label}
                  visible={on}
                  pinned={pinned}
                  pinEnabled={pinEnabled}
                  alias={getAlias(s.id)}
                  onChangeAlias={(val) => setAlias(s.id, val)}
                  accent={ACCENT_TRAMA}
                  onToggleVisible={() => sectionVis.setVisible(s.id, !on)}
                  onTogglePin={() => setPinRequired(s.id, !pinned)}
                />
              )
            })}
            <button
              onClick={sectionVis.showAll}
              className="btn-ghost text-xs mt-2 self-start"
            >
              Mostrar todo
            </button>
          </div>
        )}

        {/* Notas sections */}
        {tab === 'notas' && (
          <div className="card-segment flex flex-col animate-fade-up">
            {SECTIONS.map((s) => {
              const on = moduleVis.isVisible(s.id)
              const pinned = isPinRequired(`notas:${s.id}`)
              return (
                <SectionRow
                  key={s.id}
                  icon={s.icon}
                  label={s.label}
                  visible={on}
                  pinned={pinned}
                  pinEnabled={pinEnabled}
                  alias={getAlias(`notas:${s.id}`)}
                  onChangeAlias={(val) => setAlias(`notas:${s.id}`, val)}
                  accent={ACCENT_NOTAS}
                  onToggleVisible={() => moduleVis.setVisible(s.id, !on)}
                  onTogglePin={() => setPinRequired(`notas:${s.id}`, !pinned)}
                />
              )
            })}
            <button
              onClick={moduleVis.showAll}
              className="btn-ghost text-xs mt-2 self-start"
            >
              Mostrar todo
            </button>
          </div>
        )}

        {pinEnabled ? null : (
          <p className="text-xs text-ink-300 italic mt-2">
            Activa el bloqueo por PIN en Privacidad para poder proteger secciones con 🔒.
          </p>
        )}
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

// ────── Section row component ──────

function SectionRow({
  icon: Icon,
  label,
  visible,
  pinned,
  pinEnabled,
  alias,
  onChangeAlias,
  accent,
  onToggleVisible,
  onTogglePin,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  visible: boolean
  pinned: boolean
  pinEnabled: boolean
  alias: string
  onChangeAlias: (val: string) => void
  accent: string
  onToggleVisible: () => void
  onTogglePin: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 w-full px-2 py-1.5 rounded-md hover:bg-ink-100/50 transition-colors">
      {/* Visibility toggle (click on label/icon area) */}
      <button
        type="button"
        role="switch"
        aria-checked={visible}
        aria-label={`Sección ${label}`}
        onClick={onToggleVisible}
        className="flex items-center gap-2 flex-1 text-left min-w-0"
      >
        <Icon size={14} className="text-ink-400 shrink-0" />
        <span className="text-sm text-ink-700 truncate">{label}</span>
      </button>

      <div className="flex items-center gap-2 shrink-0">
        {/* Command/Alias Input */}
        <div className="flex items-center gap-1">
          <span className="text-micro text-ink-300 font-mono">#</span>
          <input
            type="text"
            value={alias}
            onChange={(e) => onChangeAlias(e.target.value)}
            placeholder="alias..."
            className="w-20 px-1 py-0.5 text-xs bg-ink-50/50 hover:bg-ink-100/30 focus:bg-paper-100 border border-ink-100/60 focus:border-ink-300 rounded text-ink-600 font-mono transition-colors"
            title="Comando rápido en la barra de búsqueda"
            aria-label={`Comando para ${label}`}
          />
        </div>

        {/* PIN toggle — solo si el PIN global está habilitado */}
        {pinEnabled && (
          <IconButton
            onClick={onTogglePin}
            label={`${pinned ? 'Quitar' : 'Poner'} PIN a ${label}`}
            className={`p-1 rounded transition-colors ${
              pinned ? 'text-ink-600 bg-ink-100' : 'text-ink-200 hover:text-ink-400'
            }`}
            title={pinned ? 'Protegida con PIN' : 'Sin PIN'}
          >
            <LockIcon size={12} />
          </IconButton>
        )}

        {/* Visibility badge */}
        <span
          className={`text-micro uppercase tracking-eyebrow w-12 text-right ${
            visible ? '' : 'text-ink-300'
          }`}
          style={visible ? { color: accent } : undefined}
        >
          {visible ? 'visible' : 'oculta'}
        </span>
      </div>
    </div>
  )
}
