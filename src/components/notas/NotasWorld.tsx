import { useState } from 'react'
import { ViewHeader } from '../ViewHeader'
import { EmptyMessage } from '../EmptyMessage'
import { NotesIcon, TasksIcon } from '../Icons'

/**
 * τ-worlds (Fase 1): el mundo "Trama Notas" — un workspace de productividad
 * liviana (apuntes rápidos + tareas), independiente del mapa pero con puentes
 * (p. ej. promover una nota a Momento, en una fase posterior).
 *
 * Esta primera entrega arma el FRAME: la sub-barra del mundo y sus secciones,
 * con estados de bienvenida pulidos. La captura/listado real (tabla `notes`,
 * `tasks`, endpoints, buscador) llega en la fase siguiente — acá validamos la
 * navegación y que el mundo se sienta nativo a Trama.
 */
type NotasSection = 'notas' | 'tareas'

const SECTIONS: Array<{
  id: NotasSection
  label: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}> = [
  { id: 'notas', label: 'Notas', icon: NotesIcon },
  { id: 'tareas', label: 'Tareas', icon: TasksIcon },
]

const ACCENT = 'var(--accent-sage)'

export function NotasWorld() {
  const [section, setSection] = useState<NotasSection>('notas')

  return (
    <div className="h-full w-full flex flex-col md:flex-row overflow-hidden">
      {/* Sub-barra del mundo Notas */}
      <aside className="surface-sidebar w-60 shrink-0 border-r border-ink-100 hidden md:flex flex-col">
        <header className="px-4 py-3.5">
          <p className="section-eyebrow mb-0.5">Trama</p>
          <h2 className="font-serif text-xl text-ink-800 leading-none tracking-tight">
            Notas
          </h2>
        </header>
        <nav className="flex flex-col px-2 gap-px">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            const active = section === s.id
            return (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                aria-current={active ? 'page' : undefined}
                className={`group relative flex items-center gap-2.5 pl-3 pr-2.5 py-1.5 rounded-md text-body transition-colors ${
                  active
                    ? 'text-ink-800 font-medium'
                    : 'text-ink-500 hover:text-ink-800 hover:bg-ink-100/60'
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r"
                    style={{ backgroundColor: ACCENT }}
                  />
                )}
                <span
                  className="inline-flex shrink-0"
                  style={active ? { color: ACCENT } : undefined}
                >
                  <Icon size={14} />
                </span>
                <span>{s.label}</span>
              </button>
            )
          })}
        </nav>
        <div className="flex-1" />
        <p className="text-micro uppercase tracking-wider text-ink-300 text-center pb-3">
          trama · notas
        </p>
      </aside>

      {/* Tabs en mobile (la sub-barra se oculta < md) */}
      <div className="md:hidden border-b border-ink-100 flex gap-1 px-3 py-2 surface-sidebar">
        {SECTIONS.map((s) => {
          const active = section === s.id
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                active ? 'text-ink-800 font-medium bg-ink-100/60' : 'text-ink-500'
              }`}
              style={active ? { color: ACCENT } : undefined}
            >
              <s.icon size={14} />
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Contenido */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        <div className="h-full overflow-y-auto">
          <div className="px-8 py-10 pb-24 max-w-3xl mx-auto">
            {section === 'notas' ? (
              <>
                <ViewHeader
                  title="Notas"
                  eyebrow="apuntes rápidos"
                  accent={ACCENT}
                  spacing="wide"
                  subtitle="Un lugar para pensamientos a medio cocinar, citas sueltas e ideas — en markdown, con #etiquetas y un buscador propio."
                />
                <EmptyMessage
                  illustration="thread"
                  title="Tu primer apunte, todavía sin escribir."
                  body={
                    <>
                      Este es tu cuaderno rápido dentro de Trama: notas cortas que se
                      apilan en una línea de tiempo, etiquetables y buscables. Más
                      adelante vas a poder <strong>promover</strong> una nota a Momento
                      del mapa.
                    </>
                  }
                  hint="La captura de notas llega en la próxima entrega de Trama Notas."
                />
              </>
            ) : (
              <>
                <ViewHeader
                  title="Tareas"
                  eyebrow="por realizar"
                  accent={ACCENT}
                  spacing="wide"
                  subtitle="Lo que tenés que hacer, simple y a la vista: título, detalle, fecha y etiquetas."
                />
                <EmptyMessage
                  illustration="thread"
                  title="Nada pendiente… por ahora."
                  body={
                    <>
                      Acá vivirán tus tareas, con estado, fecha opcional y las mismas
                      etiquetas que tus notas. Un módulo liviano, sin ceremonia.
                    </>
                  }
                  hint="El módulo de tareas llega junto con la captura de notas."
                />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
