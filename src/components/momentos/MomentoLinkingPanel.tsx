import { typeAccent } from '../graph/GraphNode'
import type { Entity } from '../../types'
import type { useMomentoLinking } from './useMomentoLinking'

type Linking = ReturnType<typeof useMomentoLinking>

/**
 * Panel que aparece después de crear un recorte o foto, ofreciendo
 * vínculos con entidades existentes (sugeridos por IA) y, en caso de
 * foto, un caption propuesto.
 *
 * Stateless por completo — todo viene del hook `useMomentoLinking`.
 * Sólo se renderea si hay un linkingMomento activo.
 */
export function MomentoLinkingPanel({
  linking,
  entitiesById,
  totalEntities,
}: {
  linking: Linking
  entitiesById: Map<string, Entity>
  totalEntities: number
}) {
  if (!linking.linkingMomento) return null

  const isPhoto = linking.linkingMomento.kind === 'foto'

  return (
    <section
      className="mb-10 p-5 bg-paper-100/60 border border-ink-100/60 rounded-xl space-y-3 animate-fade-up"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at center, var(--accent-gold-soft) 0%, transparent 70%)',
      }}
    >
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p
            className="section-eyebrow-serif"
            style={{ color: 'var(--accent-gold)' }}
          >
            ✦ vincular entidades
          </p>
          <p className="text-caption text-ink-400 italic mt-0.5">
            ¿A qué entidades de tu trama refiere este momento?
          </p>
        </div>
        <button
          type="button"
          onClick={linking.rerun}
          disabled={linking.suggesting}
          className="text-micro uppercase tracking-eyebrow text-ink-500 hover:text-ink-700 disabled:opacity-50"
        >
          {linking.suggesting ? 'pensando…' : '↻ re-buscar'}
        </button>
      </header>

      {isPhoto && linking.visionCaption && (
        <div className="p-3 rounded bg-paper-50/60 border border-ink-100/60">
          <p className="text-micro uppercase tracking-eyebrow text-ink-400 mb-1">
            caption propuesto
          </p>
          <p className="font-serif text-sm text-ink-600 italic">
            {linking.visionCaption}
          </p>
        </div>
      )}

      {linking.suggesting && linking.suggestedIds.length === 0 && (
        <p className="text-caption text-ink-400 italic">
          {isPhoto
            ? 'La IA está mirando la imagen…'
            : `La IA está revisando tus ${totalEntities} entidades…`}
        </p>
      )}

      {!linking.suggesting && linking.suggestedIds.length === 0 && (
        <p className="text-caption text-ink-400 italic">
          La IA no encontró menciones explícitas. Puedes guardar sin vínculos o
          re-buscar.
        </p>
      )}

      {linking.suggestedIds.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {linking.suggestedIds.map((id) => {
            const ent = entitiesById.get(id)
            if (!ent) return null
            const checked = linking.confirmedIds.has(id)
            const accent = typeAccent(ent.type)
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => linking.toggleId(id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-caption transition-all active:scale-95"
                  style={
                    checked
                      ? {
                          backgroundColor: `color-mix(in srgb, ${accent} 14%, transparent)`,
                          color: accent,
                          border: `1px solid ${accent}`,
                        }
                      : {
                          backgroundColor: 'transparent',
                          color: 'rgb(var(--ink-400))',
                          border: '1px solid rgb(var(--ink-100))',
                        }
                  }
                >
                  <span>{checked ? '✓' : '+'}</span>
                  {ent.name}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-ink-100/40">
        <button
          type="button"
          onClick={linking.close}
          className="text-micro uppercase tracking-eyebrow text-ink-300 hover:text-ink-700"
        >
          omitir
        </button>
        <button
          type="button"
          onClick={() =>
            linking.apply({
              acceptCaption: isPhoto && Boolean(linking.visionCaption),
            })
          }
          disabled={linking.isApplying}
          className="btn-ink text-xs"
        >
          {linking.isApplying
            ? 'guardando…'
            : linking.confirmedIds.size === 0
              ? isPhoto && linking.visionCaption
                ? 'Guardar caption'
                : 'Guardar sin vínculos'
              : `Guardar ${linking.confirmedIds.size} vínculo${
                  linking.confirmedIds.size === 1 ? '' : 's'
                }`}
        </button>
      </div>
    </section>
  )
}
