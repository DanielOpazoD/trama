import { useGlobalStatus, type GlobalStatus } from '../state'
import { SearchIcon } from './Icons'
import type { ViewMode } from './Sidebar'

// El símbolo del modificador de atajos depende de la plataforma. En Mac
// es ⌘, en el resto es "Ctrl". El check vive en módulo para no recalcular
// en cada render. SSR-safe (devuelve false si no hay navigator).
const IS_MAC =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
const SHORTCUT_KEY = IS_MAC ? '⌘' : 'Ctrl'

/**
 * Barra superior estilo ChatGPT/OpenAI Platform.
 *
 * Muestra el título de la vista actual y deja espacio para acciones
 * contextuales en el slot `actions`. Es la zona "noble" para identificar
 * dónde estás sin mirar el sidebar.
 *
 * Diseño:
 *   - Fondo blanco (surface-topbar), border-bottom sutil.
 *   - Title en serif para mantener identidad editorial; subtítulo en
 *     sans para metadata.
 *   - Altura compacta (~48px) para no quitar espacio al contenido.
 *   - Status pill discreto a la derecha — "guardando…" / "guardado" /
 *     "sin conexión". Es el único feedback persistente de qué hace el
 *     backend; sin esto, el usuario no sabe si su edición se persistió.
 */
const TITLES: Record<ViewMode, { title: string; subtitle?: string }> = {
  inicio: { title: 'Inicio', subtitle: 'tu trama de hoy' },
  grafo: { title: 'Grafo', subtitle: 'mapa visual de tus conexiones' },
  entidades: { title: 'Entidades', subtitle: 'personas, obras, conceptos' },
  citas: { title: 'Citas', subtitle: 'fragmentos que retuviste' },
  relaciones: { title: 'Relaciones', subtitle: 'las líneas entre nodos' },
  escuchas: { title: 'Escuchas', subtitle: 'tu música reciente' },
  chat: { title: 'Chat', subtitle: 'conversa con tu trama' },
  sugerencias: { title: 'Sugerencias', subtitle: 'propuestas de la IA' },
}

export function TopBar({
  view,
  actions,
  onOpenPalette,
  breadcrumb,
}: {
  view: ViewMode
  actions?: React.ReactNode
  /** Si está presente, dibuja un pill "Buscar ⌘K" que abre el palette.
      Su rol es discoverability — el atajo existe igual, pero sin esto
      el usuario nuevo no lo sabe. */
  onOpenPalette?: () => void
  /** Segundo nivel del breadcrumb — se muestra como "View › crumb"
      cuando hay un detalle abierto. Si está, reemplaza el subtitle. */
  breadcrumb?: { label: string; onClickRoot?: () => void } | null
}) {
  const { title, subtitle } = TITLES[view]
  const status = useGlobalStatus()
  return (
    <div className="surface-topbar shrink-0 border-b border-ink-100 px-6 py-2.5 flex items-center justify-between gap-4">
      <div className="min-w-0 flex items-baseline gap-3">
        {breadcrumb ? (
          // Path-style — clickeable la raíz para volver a la vista
          // sin abrir entidad. Lo que hace Codex con `repo › file.tsx`.
          <nav
            aria-label="Breadcrumb"
            className="min-w-0 flex items-baseline gap-2"
          >
            <button
              onClick={breadcrumb.onClickRoot}
              className="font-serif text-xl text-ink-400 hover:text-ink-700 leading-none tracking-tight transition-colors shrink-0"
            >
              {title}
            </button>
            <span className="text-ink-300 text-lg leading-none">›</span>
            <h1 className="font-serif text-xl text-ink-800 leading-none tracking-tight truncate">
              {breadcrumb.label}
            </h1>
          </nav>
        ) : (
          <>
            <h1 className="font-serif text-xl text-ink-800 leading-none tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <span className="text-sm text-ink-400 truncate">{subtitle}</span>
            )}
          </>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-3">
        <StatusPill status={status} />
        {onOpenPalette && <PalettePill onClick={onOpenPalette} />}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

/**
 * Pill discreto "Buscar ⌘K" que abre el CommandPalette. Se oculta en mobile
 * (sin teclado físico el atajo no aplica, y el sidebar ya tiene su propio
 * search arriba en esa vista).
 */
function PalettePill({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={`Buscar (${SHORTCUT_KEY} K)`}
      aria-label="Buscar"
      className="hidden sm:flex items-center gap-2 px-2.5 py-1 text-xs text-ink-400 hover:text-ink-700 bg-paper-100/60 hover:bg-paper-100 border border-ink-100/60 hover:border-ink-200 rounded-md transition-colors"
    >
      <SearchIcon size={12} />
      <span className="leading-none">Buscar</span>
      <kbd className="ml-1 text-micro px-2 py-0.5 bg-paper-50 border border-ink-200/70 rounded text-ink-400 leading-none font-mono">
        {SHORTCUT_KEY} K
      </kbd>
    </button>
  )
}

/**
 * Indicador minimalista del estado del backend. Tres formas:
 *   - guardando…   dot ámbar pulsando + texto
 *   - guardado     dot verde + texto, dura 1.2s
 *   - sin conexión dot rojo + texto, persistente
 *   - idle         nada (no contamina)
 */
function StatusPill({ status }: { status: GlobalStatus }) {
  if (status.kind === 'idle') return null

  if (status.kind === 'offline') {
    return (
      <span
        className="flex items-center gap-1.5 text-caption text-amber-700 leading-none"
        title="No se puede contactar al backend. Trabajás contra el caché local."
      >
        <span className="size-1.5 rounded-full bg-amber-600" aria-hidden />
        sin conexión
      </span>
    )
  }

  if (status.kind === 'saving') {
    return (
      <span
        className="flex items-center gap-1.5 text-caption text-ink-400 leading-none"
        title={`Guardando ${status.pending} cambio${status.pending === 1 ? '' : 's'} en el servidor`}
      >
        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" aria-hidden />
        guardando…
      </span>
    )
  }

  // saved — ✓ con scale-in animation, más visceral que un dot estático.
  // La cifra `animate-check-pop` está en index.css y dura ~400ms con un
  // pequeño overshoot (scale 0 → 1.15 → 1) que se siente como "tick".
  return (
    <span
      className="flex items-center gap-1.5 text-caption leading-none animate-fade-up"
      style={{ color: 'var(--accent-sage)' }}
      title="Cambios guardados"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-check-pop"
        aria-hidden
      >
        <path d="M5 13l4 4L19 7" />
      </svg>
      guardado
    </span>
  )
}
