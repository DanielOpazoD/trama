import { useReadingTablesQuery } from '../../state'

export function EditorialProjectsContextStrip({
  className = '',
}: {
  className?: string
}) {
  const { data: projects = [] } = useReadingTablesQuery()
  const active = projects.filter((project) => project.status !== 'cerrado').slice(0, 2)

  if (active.length === 0) return null

  return (
    <section
      aria-label="Materiales relacionados"
      className={`card-paper-soft p-4 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="section-eyebrow" style={{ color: 'var(--accent-gold)' }}>
            proyectos editoriales
          </p>
          <h3 className="mt-1 font-serif text-lg leading-tight text-ink-700">
            Materiales relacionados
          </h3>
        </div>
        <ul className="min-w-0 flex-1 space-y-1 sm:max-w-md">
          {active.map((project) => (
            <li key={project.id}>
              <a
                href="/?world=notas&section=notas"
                className="group flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-ink-100/40"
              >
                <span className="min-w-0 truncate font-serif text-sm text-ink-700 group-hover:underline">
                  {project.title}
                </span>
                <span className="shrink-0 text-micro uppercase tracking-eyebrow text-ink-300">
                  abrir en notas
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
