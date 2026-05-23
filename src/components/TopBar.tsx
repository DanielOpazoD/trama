import type { ViewMode } from './Sidebar'

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
}: {
  view: ViewMode
  actions?: React.ReactNode
}) {
  const { title, subtitle } = TITLES[view]
  return (
    <div className="surface-topbar shrink-0 border-b border-ink-100 px-6 py-2.5 flex items-center justify-between gap-4">
      <div className="min-w-0 flex items-baseline gap-3">
        <h1 className="font-serif text-xl text-ink-800 leading-none tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <span className="text-sm text-ink-400 truncate">{subtitle}</span>
        )}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  )
}
