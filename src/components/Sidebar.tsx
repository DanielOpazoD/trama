import {
  acknowledgeHealthAlerts,
  useCountsQuery,
  useHealthAlerts,
  useMomentoShareInvitationsQuery,
  useProactiveQuery,
} from '../state'
import { useIsMobile } from '../hooks/useIsMobile'
import { useSectionVisibility } from '../hooks/useSectionVisibility'
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, SettingsIcon } from './Icons'
import { IconButton } from './IconButton'
import { AIModeToggle } from './AIModeToggle'
import { NavButton } from './sidebar/NavButton'
import { NAV_GROUPS } from '../lib/navigation'
import { Tooltip } from './Tooltip'
import { SECTION_ACCENT } from '../lib/sectionAccent'
import { WorldSwitcher } from './WorldSwitcher'
import type { World } from '../types/world'

// El símbolo del modificador de atajos depende de la plataforma. En Mac
// es ⌘, en el resto es "Ctrl". El check vive en módulo para no recalcular
// en cada render. SSR-safe (devuelve false si no hay navigator).
const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
const SHORTCUT_KEY = IS_MAC ? '⌘' : 'Ctrl'

// ο1: 'relaciones' se eliminó del top-level. Ahora vive como tab interna
// "Vínculos" dentro de Entidades — refleja la dependencia conceptual real
// (una relación nunca existe sola, siempre conecta entidades).
//
// Q1: el tipo en sí vive en `src/types/view.ts`. Re-exportado acá por
// compat con call sites históricos.
import type { ViewMode } from '../types/view'
export type { ViewMode }

// τ-IA: las vistas top-level se agrupan por naturaleza (Mi trama / Miradas /
// Diálogo) para descomprimir la barra. La lista —antes definida acá— vive
// ahora en src/lib/navigation.ts como fuente de verdad compartida con la
// MobileBottomNav y la hoja "Más". Editar las vistas se hace allí.

// λ4: la firma cromática por vista vive en src/lib/sectionAccent.ts —
// fuente de verdad compartida entre Sidebar, MobileBottomNav y
// SectionAccentBand. Si querés ajustar un color, edita ahí.

export function Sidebar({
  view,
  onChangeView,
  world,
  onChangeWorld,
  onWorldIntent,
  collapsed,
  onToggleCollapsed,
  offline,
  onOpenSettings,
  onOpenPalette,
}: {
  view: ViewMode
  onChangeView: (v: ViewMode) => void
  /** Mundo activo + conmutador — el logo del header abre el menú de mundos. */
  world: World
  onChangeWorld: (w: World) => void
  onWorldIntent?: (w: World) => void
  collapsed: boolean
  onToggleCollapsed: () => void
  offline: boolean
  onOpenSettings: () => void
  /** ρ-struct: el trigger del CommandPalette (Cmd+K) ahora vive acá en
      vez del TopBar. El atajo sigue funcionando igual; este botón es
      solo discoverability — un usuario nuevo lo ve directo. */
  onOpenPalette: () => void
}) {
  const { data: pendingSuggestions = [] } = useProactiveQuery()
  const { data: shareInvitations } = useMomentoShareInvitationsQuery()
  const pendingShareInvitations = shareInvitations?.items?.length ?? 0
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
    // ρ-consistency: counts.mts ya devuelve momentos.count; antes este
    // badge faltaba y Momentos era el único item del sidebar sin
    // número. Coherencia con las demás secciones.
    momentos: totals?.momentos ?? null,
    escuchas: null,
    // Los bookmarks guardados no vienen en el endpoint de counts; sin badge.
    twitter: null,
    // Cronología es una superficie de lectura que teje varias corrientes —
    // un único "count" no tendría sentido (¿citas? ¿momentos? ¿la suma?).
    cronologia: null,
    // El Atlas es un snapshot de constelaciones; tampoco hay un único
    // count que tenga sentido como badge.
    atlas: null,
    chat: null,
    sugerencias: pendingSuggestions.length > 0 ? pendingSuggestions.length : null,
  }
  const healthTone =
    healthAlerts.maxSeverity === 'error'
      ? 'var(--accent-clay)'
      : healthAlerts.maxSeverity === 'warn'
        ? 'var(--accent-gold)'
        : 'var(--accent-primary)'
  const healthToneSoft =
    healthAlerts.maxSeverity === 'error'
      ? 'rgb(185 28 28 / 0.12)'
      : healthAlerts.maxSeverity === 'warn'
        ? 'var(--accent-gold-soft)'
        : 'var(--accent-primary-soft)'

  const sectionVis = useSectionVisibility()

  // ο2: Sugerencias auto-hide del nav cuando no hay propuestas pendientes.
  // El CommandPalette mantiene la entrada accesible siempre (para forzar
  // "pedir ronda"); el toast semanal κ2 sigue siendo el wake-up natural.
  // τ-IA: el filtro se aplica dentro de cada grupo y se descartan los grupos
  // que queden vacíos (hoy sólo afecta a "Diálogo", que conserva Chat).
  // ρ-personal: también se filtran las secciones que el usuario ocultó
  // desde Personalización (visibleSections en UserPrefs).
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        (item.value !== 'sugerencias' || pendingSuggestions.length > 0) &&
        (sectionVis.isVisible(item.value) || view === item.value),
    ),
  })).filter((group) => group.items.length > 0)

  // ---------- collapsed sidebar ----------
  if (collapsed) {
    return (
      <aside className="surface-sidebar w-14 shrink-0 border-r border-ink-100 flex flex-col items-center py-4 gap-1">
        <div className="mb-2">
          <WorldSwitcher
            world={world}
            onChangeWorld={onChangeWorld}
            onWorldIntent={onWorldIntent}
            collapsed
          />
        </div>

        <IconButton
          onClick={onToggleCollapsed}
          label="Expandir sidebar"
          className="touch-target p-2 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded-md transition-colors"
        >
          <ChevronRightIcon size={14} />
        </IconButton>

        <Tooltip content={`Buscar (${SHORTCUT_KEY} K)`} side="bottom">
          <IconButton
            onClick={onOpenPalette}
            label={`Buscar (${SHORTCUT_KEY} K)`}
            className="touch-target p-2 text-ink-400 hover:text-ink-700 hover:bg-ink-50 rounded-md transition-colors"
          >
            <SearchIcon size={14} />
          </IconButton>
        </Tooltip>

        <div className="w-7 h-px bg-ink-100/70 my-2" />

        <nav className="flex flex-col items-center gap-1">
          {visibleGroups.map((group, gi) => (
            <div key={gi} className="flex flex-col items-center gap-1">
              {/* Filete sólo antes de los grupos rotulados (el rótulo no cabe
                  en 56px). El grupo sin rótulo (Inicio) fluye sin filete,
                  con la misma separación que el resto de los iconos. */}
              {group.label && <div className="w-7 h-px bg-ink-100/70 my-1" />}
              {group.items.map((item) => (
                <NavButton
                  key={item.value}
                  item={item}
                  active={view === item.value}
                  count={counts[item.value]}
                  noticeCount={item.value === 'momentos' ? pendingShareInvitations : 0}
                  mode="collapsed"
                  accentColor={SECTION_ACCENT[item.value]}
                  onClick={() => onChangeView(item.value)}
                />
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1 items-center">
          {offline && (
            <span
              title="modo local"
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: 'var(--accent-gold)' }}
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
              className="touch-target relative p-2 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded-md transition-colors active:scale-95"
            >
              <SettingsIcon size={14} />
              {healthAlerts.maxSeverity && (
                <span
                  aria-hidden
                  className={`absolute top-1 right-1 size-1.5 rounded-full ${
                    healthAlerts.maxSeverity !== 'info' ? 'animate-pulse-subtle' : ''
                  }`}
                  style={{ backgroundColor: healthTone }}
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
          <div className="flex items-center gap-2 min-w-0">
            {/* τ-worlds: el logo es el conmutador de mundos (abre el menú). */}
            <WorldSwitcher
              world={world}
              onChangeWorld={onChangeWorld}
              onWorldIntent={onWorldIntent}
            />
            {offline && (
              <span
                title="Sin conexión al backend"
                className="text-micro uppercase tracking-wider leading-none shrink-0"
                style={{ color: 'var(--accent-gold)' }}
              >
                local
              </span>
            )}
          </div>
          <IconButton
            onClick={onToggleCollapsed}
            label="Contraer sidebar"
            className="touch-target p-1 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded transition-colors shrink-0"
          >
            <ChevronLeftIcon size={14} />
          </IconButton>
        </header>

        {/* σ-followup: buscador del sidebar con fondo blanco (paper-50)
          y sin el kbd "⌘ K" — el atajo ahora vive visible en el header
          del CommandPalette modal cuando se abre. Esto deja el botón
          más limpio y reserva el kbd para el contexto donde aporta
          (la herramienta abierta), no en el trigger. */}
        <div className="px-2 mb-1.5">
          <button
            onClick={onOpenPalette}
            aria-label={`Buscar (${SHORTCUT_KEY} K)`}
            className="touch-target w-full flex items-center gap-2 px-2.5 py-1.5 text-caption text-ink-400 hover:text-ink-700 bg-paper-50 hover:bg-paper-100 border border-ink-100/60 hover:border-ink-200 rounded-md transition-colors"
          >
            <SearchIcon size={12} />
            <span className="flex-1 text-left leading-none">Buscar</span>
          </button>
        </div>

        {/* τ-IA: la nav es la zona flexible con scroll propio. Antes un
            spacer flex-1 empujaba el pie al fondo, pero si la nav crecía
            (los grupos suman alto) el pie se iba por debajo del viewport y
            recortaba el popover del toggle IA. Con flex-1 + overflow acá, el
            pie queda anclado y la nav scrollea si hace falta. */}
        <nav className="flex flex-col px-2 flex-1 min-h-0 overflow-y-auto">
          {visibleGroups.map((group, gi) => (
            // Sólo los grupos rotulados llevan margen superior. El grupo sin
            // rótulo (Inicio) fluye pegado al anterior con la misma
            // separación que los ítems entre sí.
            <div key={gi} className={group.label ? 'mt-3' : ''}>
              {group.label && (
                <p className="px-3 pb-1 text-micro uppercase tracking-eyebrow text-ink-300/90 select-none">
                  {group.label}
                </p>
              )}
              <div className="flex flex-col gap-px">
                {group.items.map((item) => (
                  <NavButton
                    key={item.value}
                    item={item}
                    active={view === item.value}
                    count={counts[item.value]}
                    noticeCount={item.value === 'momentos' ? pendingShareInvitations : 0}
                    mode="expanded"
                    badgeTone={item.value === 'sugerencias' ? 'accent' : 'default'}
                    accentColor={SECTION_ACCENT[item.value]}
                    onClick={() => onChangeView(item.value)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-2 pt-2 pb-2 mt-2 border-t border-ink-100 space-y-px">
          <AIModeToggle />
          <button
            onClick={handleOpenSettings}
            className="touch-target w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-body text-ink-500 hover:text-ink-800 hover:bg-ink-100/60 transition-colors"
          >
            <SettingsIcon size={14} className="text-ink-400" />
            <span className="flex-1 text-left">Configuración</span>
            {healthAlerts.maxSeverity && (
              <span
                className="text-micro uppercase tracking-eyebrow tabular-nums px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: healthToneSoft, color: healthTone }}
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
