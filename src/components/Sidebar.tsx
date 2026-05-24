import {
  acknowledgeHealthAlerts,
  useCountsQuery,
  useHealthAlerts,
  useProactiveQuery,
} from '../state'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChatIcon,
  EntitiesIcon,
  GraphIcon,
  HomeIcon,
  MomentosIcon,
  MusicIcon,
  QuoteIcon,
  RelationsIcon,
  SettingsIcon,
  SparkleIcon,
  TramaMark,
} from './Icons'
import { AIModeToggle } from './AIModeToggle'
import { NavButton, type NavItem } from './sidebar/NavButton'
import { Tooltip } from './Tooltip'

export type ViewMode = 'inicio' | 'grafo' | 'entidades' | 'citas' | 'relaciones' | 'escuchas' | 'momentos' | 'chat' | 'sugerencias'

const NAV_ITEMS: NavItem[] = [
  { value: 'inicio', label: 'Inicio', icon: HomeIcon },
  { value: 'grafo', label: 'Grafo', icon: GraphIcon },
  { value: 'entidades', label: 'Entidades', icon: EntitiesIcon },
  { value: 'citas', label: 'Citas', icon: QuoteIcon },
  { value: 'momentos', label: 'Momentos', icon: MomentosIcon },
  { value: 'relaciones', label: 'Relaciones', icon: RelationsIcon },
  { value: 'escuchas', label: 'Escuchas', icon: MusicIcon },
  { value: 'chat', label: 'Chat', icon: ChatIcon },
  { value: 'sugerencias', label: 'Sugerencias', icon: SparkleIcon },
]

/**
 * λ4: cada vista del sidebar tiene una "firma cromática" que se aplica
 * a la barra lateral del activo + al icono activo. Antes todas usaban
 * ink-700 (gris uniforme), lo que dejaba la nav sin pulso. Ahora:
 *
 *   Inicio       → gold        (saludo cálido, momento de entrada)
 *   Grafo        → primary     (azul prusia — el mapa)
 *   Entidades    → persona     (marrón cálido de la mayoría de tipos)
 *   Citas        → gold        (el lugar donde el lenguaje pesa)
 *   Relaciones   → sage        (vínculos vegetales, no técnicos)
 *   Escuchas     → musico      (el rojo-tierra del tipo "musico")
 *   Chat         → primary     (azul, conversación con la IA)
 *   Sugerencias  → primary     (mismo azul; la IA propone)
 *
 * El color se inyecta como CSS var inline para que NavButton lo aplique
 * sin saber qué sección renderiza.
 */
const SECTION_ACCENT: Record<ViewMode, string> = {
  inicio: 'var(--accent-gold)',
  grafo: 'var(--accent-primary)',
  entidades: 'var(--type-persona)',
  citas: 'var(--accent-gold)',
  momentos: 'var(--type-evento)',
  relaciones: 'var(--accent-sage)',
  escuchas: 'var(--type-musico)',
  chat: 'var(--accent-primary)',
  sugerencias: 'var(--accent-primary)',
}

export function Sidebar({
  view,
  onChangeView,
  collapsed,
  onToggleCollapsed,
  offline,
  onOpenSettings,
}: {
  view: ViewMode
  onChangeView: (v: ViewMode) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  offline: boolean
  onOpenSettings: () => void
}) {
  const { data: pendingSuggestions = [] } = useProactiveQuery()
  // Counts vienen del endpoint agregado — el Sidebar ya no carga la lista
  // completa de entidades. A 100k+ es la única opción viable.
  const { data: totals } = useCountsQuery()
  // Alertas de salud (budget alto, errores recientes, embeddings sin
  // indexar). Si hay algo activo Y todavía no las vio el user, pintamos
  // un dot en el botón de Configuración como guiño "abre Estado del
  // sistema". Al click reconocemos los códigos visibles — el dot
  // desaparece hasta que llegue uno nuevo.
  const healthAlerts = useHealthAlerts()
  const isMobile = useIsMobile()

  function handleOpenSettings() {
    // ACK los códigos actualmente activos. Si reaparecen exactos no
    // vuelven a notificar; si aparece un código nuevo (e.g.
    // "embeddings-pending" después de un nuevo extract sin key) el dot
    // vuelve a iluminarse.
    acknowledgeHealthAlerts(healthAlerts.alerts.map((a) => a.code))
    onOpenSettings()
  }

  const counts: Record<ViewMode, number | null> = {
    inicio: null,
    grafo: null,
    // Sin fallback wholesale: si los totales todavía no cargaron, mostramos
    // null (la UI no pinta el badge). Es mejor que mentir con "0".
    entidades: totals?.entities ?? null,
    citas: totals?.quotes ?? null,
    momentos: null, // se podría sumar pero exige otro endpoint; por ahora null
    relaciones: totals?.relationships ?? null,
    escuchas: null,
    chat: null,
    sugerencias: pendingSuggestions.length > 0 ? pendingSuggestions.length : null,
  }

  // ---------- collapsed sidebar ----------
  if (collapsed) {
    return (
      <aside className="surface-sidebar w-14 shrink-0 border-r border-ink-100 flex flex-col items-center py-4 gap-1">
        <div className="text-ink-700 mb-2 trama-mark-interactive" aria-label="Trama" title="Trama">
          <TramaMark size={22} />
        </div>

        <button
          onClick={onToggleCollapsed}
          aria-label="Expandir sidebar"
          className="p-2 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded-md transition-colors"
        >
          <ChevronRightIcon size={14} />
        </button>

        <div className="w-7 h-px bg-ink-100/70 my-2" />

        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.value}
              item={item}
              active={view === item.value}
              count={counts[item.value]}
              mode="collapsed"
              accentColor={SECTION_ACCENT[item.value]}
              onClick={() => onChangeView(item.value)}
            />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1 items-center">
          {offline && (
            <span
              title="modo local"
              className="w-1.5 h-1.5 rounded-full bg-amber-500/70"
              aria-label="Sin conexión al backend"
            />
          )}
          <AIModeToggle collapsed />
          <Tooltip
            content={
              healthAlerts.maxSeverity
                ? `Configuración — ${healthAlerts.count} ${healthAlerts.count === 1 ? 'alerta' : 'alertas'}`
                : 'Configuración'
            }
            side="bottom"
          >
            <button
              onClick={handleOpenSettings}
              aria-label={
                healthAlerts.maxSeverity
                  ? `Configuración (${healthAlerts.count} ${healthAlerts.count === 1 ? 'alerta' : 'alertas'})`
                  : 'Configuración'
              }
              className="relative p-2 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded-md transition-colors active:scale-95"
            >
              <SettingsIcon size={14} />
              {healthAlerts.maxSeverity && (
                <span
                  aria-hidden
                  className={`absolute top-1 right-1 size-1.5 rounded-full ${
                    healthAlerts.maxSeverity === 'error'
                      ? 'bg-red-600'
                      : healthAlerts.maxSeverity === 'warn'
                        ? 'bg-amber-500'
                        : 'bg-sky-500'
                  } ${healthAlerts.maxSeverity !== 'info' ? 'animate-pulse-subtle' : ''}`}
                />
              )}
            </button>
          </Tooltip>
        </div>
      </aside>
    )
  }

  // ---------- expanded sidebar ----------
  return (
    <>
      {/* Mobile: backdrop closes the sidebar when tapped. */}
      {isMobile && (
        <button
          onClick={onToggleCollapsed}
          aria-label="Cerrar menú"
          className="fixed inset-0 z-30 bg-ink-900/30 backdrop-blur-sm cursor-default md:hidden"
          tabIndex={-1}
        />
      )}
    <aside
      className={
        isMobile
          ? 'surface-sidebar fixed inset-y-0 left-0 w-64 z-40 border-r border-ink-100 flex flex-col shadow-lg'
          : 'surface-sidebar w-64 shrink-0 border-r border-ink-100 flex flex-col'
      }
    >
      <header className="px-3 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 trama-mark-interactive min-w-0" title="Trama">
          <TramaMark size={22} className="text-ink-700 shrink-0" />
          {/* Brand wordmark — no es heading semántico de la página
              (el h1 vive en TopBar con el título de la vista). */}
          <span className="wordmark text-lg text-ink-800 leading-none truncate">Trama</span>
          {offline && (
            <span
              title="Sin conexión al backend"
              className="text-micro uppercase tracking-wider text-amber-700 leading-none shrink-0"
            >
              local
            </span>
          )}
        </div>
        <button
          onClick={onToggleCollapsed}
          aria-label="Contraer sidebar"
          className="p-1 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded transition-colors shrink-0"
        >
          <ChevronLeftIcon size={14} />
        </button>
      </header>

      {/* Búsqueda unificada en ⌘K (TopBar palette pill o atajo de teclado).
          Antes había un input acá que duplicaba la intención — Codex/Linear
          tienen una sola entrada de búsqueda, no dos. */}

      <nav className="flex flex-col px-2 gap-px">
        {NAV_ITEMS.map((item) => (
          <NavButton
            key={item.value}
            item={item}
            active={view === item.value}
            count={counts[item.value]}
            mode="expanded"
            badgeTone={item.value === 'sugerencias' ? 'accent' : 'default'}
            accentColor={SECTION_ACCENT[item.value]}
            onClick={() => onChangeView(item.value)}
          />
        ))}
      </nav>

      <div className="flex-1" />

      <div className="px-2 pt-2 pb-2 mt-2 border-t border-ink-100 space-y-px">
        <AIModeToggle />
        <button
          onClick={handleOpenSettings}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-body text-ink-500 hover:text-ink-800 hover:bg-ink-100/60 transition-colors"
        >
          <SettingsIcon size={14} className="text-ink-400" />
          <span className="flex-1 text-left">Configuración</span>
          {healthAlerts.maxSeverity && (
            <span
              className={`text-micro uppercase tracking-eyebrow tabular-nums px-1.5 py-0.5 rounded-full font-medium ${
                healthAlerts.maxSeverity === 'error'
                  ? 'bg-red-100 text-red-700'
                  : healthAlerts.maxSeverity === 'warn'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-sky-100 text-sky-700'
              }`}
              aria-label={`${healthAlerts.count} ${
                healthAlerts.count === 1 ? 'alerta' : 'alertas'
              }`}
            >
              {healthAlerts.count}
            </span>
          )}
        </button>
        {/* Versión leída del package.json en build-time (vite.config.ts
            inyecta VITE_APP_VERSION). Single source of truth — no hay
            que recordar actualizar este string a mano. */}
        <p className="text-micro uppercase tracking-wider text-ink-300 text-center pt-2 pb-0.5">
          trama · v{import.meta.env.VITE_APP_VERSION}
        </p>
      </div>
    </aside>
    </>
  )
}
