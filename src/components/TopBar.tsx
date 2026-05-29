import { useGlobalStatus, type GlobalStatus } from '../state'
import type { ViewMode } from './Sidebar'
import { ReadingIcon } from './Icons'
import { UserMenu } from './UserMenu'

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
  escuchas: { title: 'Escuchas', subtitle: 'tu música reciente' },
  momentos: { title: 'Momentos', subtitle: 'la dimensión temporal de tu trama' },
  cronologia: { title: 'Cronología', subtitle: 'hojear el tiempo, por estaciones' },
  atlas: { title: 'Atlas', subtitle: 'constelaciones de tu trama' },
  chat: { title: 'Chat', subtitle: 'conversa con tu trama' },
  sugerencias: { title: 'Sugerencias', subtitle: 'propuestas de la IA' },
}

export type TopBarTab = { value: string; label: string }

export function TopBar({
  view,
  actions,
  breadcrumb,
  tabs,
  onSortes,
}: {
  view: ViewMode
  actions?: React.ReactNode
  /** Abre Sortes (segunda lectura — una cita al azar). Si se omite, el
      botón no se muestra. */
  onSortes?: () => void
  /** Segundo nivel del breadcrumb — se muestra como "View › crumb"
      cuando hay un detalle abierto. Si está, reemplaza el subtitle. */
  breadcrumb?: { label: string; onClickRoot?: () => void } | null
  /** ρ-struct: tabs contextuales del workspace activo. Antes vivían en
      el header interno de la vista (EntitiesWorkbench tenía "Listado"
      y "Vínculos" debajo del h2). Subirlas al TopBar las hace
      navegables sin importar el scroll y libera el header editorial
      del cuerpo. Si hay breadcrumb activo, las tabs se ocultan — el
      contexto manda. */
  tabs?: {
    items: TopBarTab[]
    active: string
    onChange: (value: string) => void
    'aria-label'?: string
  } | null
}) {
  const { title, subtitle } = TITLES[view]
  const status = useGlobalStatus()
  const showTabs = !!tabs && !breadcrumb
  return (
    <div className="surface-topbar shrink-0 border-b border-ink-100 px-6 py-2.5 flex items-center justify-between gap-4">
      <div className="min-w-0 flex items-baseline gap-4">
        {breadcrumb ? (
          // Path-style — clickeable la raíz para volver a la vista
          // sin abrir entidad. Lo que hace Codex con `repo › file.tsx`.
          <nav aria-label="Breadcrumb" className="min-w-0 flex items-baseline gap-2">
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
            <h1 className="font-serif text-xl text-ink-800 leading-none tracking-tight shrink-0">
              {title}
            </h1>
            {showTabs ? (
              <TabsStrip tabs={tabs!} />
            ) : (
              subtitle && (
                <span className="text-sm text-ink-400 truncate">{subtitle}</span>
              )
            )}
          </>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-3">
        <StatusPill status={status} />
        {onSortes && (
          <button
            onClick={onSortes}
            aria-label="Sortes — una cita al azar para releer"
            title="Sortes — una cita al azar para releer"
            className="p-1.5 text-ink-300 hover:text-ink-700 hover:bg-ink-50 rounded transition-colors"
          >
            <ReadingIcon size={16} />
          </button>
        )}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
        <UserMenu />
      </div>
    </div>
  )
}

/**
 * ρ-struct: tabs contextuales en TopBar. Estilo de pestañas suave —
 * activo lleva el text-ink-800 + underline en accent-primary; inactivo
 * en ink-400. Indicador es absoluto al borde inferior del TopBar para
 * que se sienta como continuación natural del workspace.
 */
function TabsStrip({ tabs }: { tabs: NonNullable<TopBarTabsProp> }) {
  return (
    <nav
      role="tablist"
      aria-label={tabs['aria-label'] ?? 'Sub-secciones'}
      className="flex items-baseline gap-5"
    >
      {tabs.items.map((item) => {
        const active = item.value === tabs.active
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => tabs.onChange(item.value)}
            className={`relative text-sm leading-none transition-colors ${
              active ? 'text-ink-800 font-medium' : 'text-ink-400 hover:text-ink-700'
            }`}
          >
            {item.label}
            {active && (
              <span
                aria-hidden
                className="absolute left-0 right-0 -bottom-[10px] h-[2px] rounded-t"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              />
            )}
          </button>
        )
      })}
    </nav>
  )
}
type TopBarTabsProp = {
  items: TopBarTab[]
  active: string
  onChange: (value: string) => void
  'aria-label'?: string
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
  // ω-B: alrededor del ✓ una micro-onda concéntrica (animate-ripple)
  // que se expande una vez al aparecer — refuerza la sensación de "tic".
  return (
    <span
      className="flex items-center gap-1.5 text-caption leading-none animate-fade-up"
      style={{ color: 'var(--accent-sage)' }}
      title="Cambios guardados"
    >
      <span className="relative inline-flex" aria-hidden>
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
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
        <span
          className="absolute inset-0 rounded-full animate-saved-ripple"
          style={{ border: '1.5px solid currentColor' }}
        />
      </span>
      guardado
    </span>
  )
}
