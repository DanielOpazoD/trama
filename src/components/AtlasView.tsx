import { useAtlasQuery, useGenerateAtlas, useToast } from '../state'
import { typeAccent } from '../lib/typeAccents'
import { ViewHeader } from './ViewHeader'
import { EmptyMessage } from './EmptyMessage'
import { SkeletonList, TimelineRowSkeleton } from './Skeleton'
import { RefreshIcon } from './Icons'
import { AISourceTag } from './AISourceTag'
import { Tooltip } from './Tooltip'
import type { AtlasConstellation } from '../api'

/**
 * Atlas temático (Bloque #5) — el cielo de la trama.
 *
 * No es el Grafo (aristas que el usuario trazó a mano, topología explícita):
 * es un mapa de *cercanías semánticas* que un algoritmo descubre sobre los
 * embeddings de las entidades, sin que nadie las haya vinculado. La IA mira
 * cada grupo y le pone nombre de constelación.
 *
 * Es un artefacto generado con caché, igual que las Crónicas: el costo de la
 * IA se paga solo al "trazar el atlas"; cada visita normal solo lee el último
 * snapshot. Por eso la generación vive detrás de un botón explícito.
 *
 * Superficie de lectura, no lienzo: las constelaciones se leen de arriba a
 * abajo como capítulos, cada una con su glosa y sus entidades-miembro
 * clickeables (→ abren la entidad).
 */
export function AtlasView({ onSelectEntity }: { onSelectEntity: (id: string) => void }) {
  const { data, isLoading } = useAtlasQuery()
  const generate = useGenerateAtlas()
  const toast = useToast()

  const trazar = async () => {
    try {
      await generate.mutateAsync()
    } catch (err) {
      toast.show({
        message: err instanceof Error ? err.message : 'No se pudo trazar el atlas',
        tone: 'error',
      })
    }
  }

  const clusters = data?.clusters ?? []
  const hasAtlas = clusters.length > 0

  return (
    <>
      <ViewHeader
        title="Atlas"
        eyebrow="✦ el cielo de tu trama"
        accent="var(--type-idea)"
        subtitle="Las entidades agrupadas por cercanía semántica —no por vínculos que trazaste, sino por lo que un algoritmo reconoce afín en sus textos—. La IA nombra cada constelación. Se traza a pedido; mientras tanto, esta página solo lee la última foto."
        spacing="tight"
        action={
          hasAtlas ? (
            <Tooltip content={generate.isPending ? 'Trazando…' : 'Regenerar atlas'}>
              <button
                onClick={trazar}
                disabled={generate.isPending}
                aria-label="Regenerar atlas"
                className="p-1.5 rounded text-ink-300 hover:text-ink-700 hover:bg-ink-100 transition-colors disabled:opacity-50"
              >
                <RefreshIcon
                  size={15}
                  className={generate.isPending ? 'animate-spin' : undefined}
                />
              </button>
            </Tooltip>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <SkeletonList count={4} Component={TimelineRowSkeleton} />
        </div>
      ) : !hasAtlas ? (
        <EmptyMessage
          illustration="weave"
          title="El cielo todavía no está trazado"
          body={
            <>
              Cuando tu trama tenga suficientes entidades, la IA puede agruparlas por
              afinidad semántica y nombrar las constelaciones que emergen. Es una sola
              lectura del estado actual —puedes volver a trazarla cuando crezca—.
            </>
          }
          action={
            <button onClick={trazar} disabled={generate.isPending} className="btn-accent">
              {generate.isPending ? 'Trazando el atlas…' : 'Trazar el atlas'}
            </button>
          }
        />
      ) : (
        <div className="space-y-12">
          {clusters.map((c) => (
            <Constellation key={c.id} cluster={c} onSelectEntity={onSelectEntity} />
          ))}

          {data?.generatedAt && (
            <footer className="text-caption text-ink-300 italic pt-2 flex items-center gap-1.5">
              <span>
                Atlas de {data.entityCount}{' '}
                {data.entityCount === 1 ? 'entidad' : 'entidades'} · trazado el{' '}
                {new Date(data.generatedAt).toLocaleDateString('es', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              <AISourceTag provider={data.provider} model={data.model} size={11} />
            </footer>
          )}
        </div>
      )}
    </>
  )
}

/** Una constelación: nombre + glosa + entidades-miembro clickeables. */
function Constellation({
  cluster,
  onSelectEntity,
}: {
  cluster: AtlasConstellation
  onSelectEntity: (id: string) => void
}) {
  return (
    <section className="animate-fade-up">
      <div className="mb-1 flex items-baseline gap-3">
        <h3
          className="font-serif text-2xl text-ink-700 leading-tight"
          style={{ color: 'var(--type-idea)' }}
        >
          {cluster.name}
        </h3>
        <span className="flex-1 h-px bg-ink-100/40" />
        <span className="text-caption text-ink-300 tabular-nums shrink-0">
          {cluster.members.length}
        </span>
      </div>
      {cluster.summary && (
        <p className="mb-4 text-sm text-ink-400 italic leading-relaxed max-w-2xl">
          {cluster.summary}
        </p>
      )}
      <ul className="flex flex-wrap gap-2">
        {cluster.members.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onSelectEntity(m.id)}
              className="text-left text-sm text-ink-600 hover:text-ink-900 bg-paper-50 border border-ink-100/60 hover:border-ink-200 rounded-md px-2.5 py-1 transition-colors"
              style={{ borderLeftColor: typeAccent(m.type), borderLeftWidth: '3px' }}
            >
              {m.name}
              {m.year ? <span className="ml-1.5 text-ink-300">{m.year}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
