import type { Prompt } from '../../api'
import { usePromptVersionsQuery, useRestorePromptVersion } from '../../state'
import { LoadingHint } from '../LoadingHint'
import {
  buildVersionEntries,
  describirCambios,
  fechaDeVersion,
} from './promptVersionModel'

/**
 * Historial de un prompt: cada edición del texto deja aquí la versión que
 * había antes.
 *
 * Va detrás de un desplegable y no a la vista, porque mirar el pasado de un
 * prompt es infrecuente comparado con copiarlo. Se consulta sólo al abrirlo —
 * es una petición por prompt y la biblioteca puede tener docenas.
 *
 * Cada fila dice **qué cambió** en la edición que la reemplazó, que es lo que
 * convierte una pila de textos casi idénticos en algo legible de un vistazo.
 */
export function PromptVersionsPanel({
  prompt,
  open,
  busy,
}: {
  prompt: Prompt
  open: boolean
  busy: boolean
}) {
  const versionsQuery = usePromptVersionsQuery(prompt.id, open)
  const restore = useRestorePromptVersion()

  if (!open) return null

  if (versionsQuery.isLoading) {
    return (
      <div className="mt-3 border-t border-ink-100/70 pt-3">
        <LoadingHint text="cargando historial" size="sm" />
      </div>
    )
  }

  const entries = buildVersionEntries(prompt, versionsQuery.data ?? [])

  if (entries.length === 0) {
    return (
      <div className="mt-3 border-t border-ink-100/70 pt-3">
        <p className="text-caption leading-relaxed text-ink-400">
          Todavía no hay versiones anteriores. Cada vez que edites el texto, el anterior
          queda guardado aquí.
        </p>
      </div>
    )
  }

  return (
    <section className="mt-3 border-t border-ink-100/70 pt-3">
      <h4 className="text-micro uppercase tracking-eyebrow text-ink-300">
        historial · {entries.length}
        {entries.length === 1 ? ' versión' : ' versiones'}
      </h4>
      <ol className="mt-2 space-y-2">
        {entries.map(({ version, cambios, igualAlActual }) => (
          <li
            key={version.id}
            className="rounded-lg border border-ink-100/70 bg-paper-50/50 px-3 py-2"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-caption tabular-nums text-ink-500">
                {fechaDeVersion(version.createdAt)}
              </span>
              <span className="text-micro uppercase tracking-eyebrow text-ink-300">
                cambió {describirCambios(cambios)}
              </span>
              <span className="flex-1" />
              {igualAlActual ? (
                <span className="text-micro uppercase tracking-eyebrow text-ink-300">
                  es la actual
                </span>
              ) : (
                <button
                  onClick={() =>
                    restore.mutate({ promptId: prompt.id, versionId: version.id })
                  }
                  disabled={busy || restore.isPending}
                  className="text-micro uppercase tracking-eyebrow text-ink-400 transition-colors hover:text-ink-700 disabled:opacity-50"
                >
                  restaurar
                </button>
              )}
            </div>
            {version.title !== prompt.title && (
              <p className="mt-1 truncate text-caption text-ink-500">{version.title}</p>
            )}
            <p className="mt-1 whitespace-pre-wrap text-caption leading-relaxed text-ink-400 line-clamp-4">
              {version.content}
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-micro text-ink-300">
        Restaurar guarda antes la versión actual: nunca se pierde ninguna.
      </p>
    </section>
  )
}
