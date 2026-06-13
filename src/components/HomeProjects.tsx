import { useReadingTablesQuery } from '../state'

/**
 * "Retomar el hilo": acceso desde Inicio a los proyectos editoriales en curso
 * (no cerrados). Refuerza la persistencia de la mesa editorial — el usuario
 * vuelve a su trabajo sin reconstruirlo. Se oculta del todo si no hay proyectos
 * abiertos. El enlace entra por Recortes > Mesa con ?project=<id>.
 */
export function HomeProjects() {
  const { data: projects = [] } = useReadingTablesQuery()
  const active = projects.filter((p) => p.status !== 'cerrado').slice(0, 3)
  if (active.length === 0) return null

  return (
    <section aria-label="Proyectos en curso" className="card-paper-soft mb-10 p-5">
      <p className="section-eyebrow" style={{ color: 'var(--accent-gold)' }}>
        retomar el hilo
      </p>
      <ul className="mt-3 space-y-1">
        {active.map((p) => (
          <li key={p.id}>
            <a
              href={`/?view=recortes&tab=mesa&project=${p.id}`}
              className="group flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-ink-100/40"
            >
              <span className="min-w-0 truncate font-serif text-lead text-ink-700 group-hover:underline">
                {p.title}
              </span>
              <span className="shrink-0 text-micro uppercase tracking-eyebrow text-ink-300">
                {p.status}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
