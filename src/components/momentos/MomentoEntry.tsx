import { typeAccent } from '../graph/GraphNode'
import type { Entity, Momento } from '../../types'
import { SparkleIcon, TrashIcon } from '../Icons'
import { formatTime } from './helpers'

/**
 * Una entrada del timeline de Momentos. Despacha al renderer correcto
 * según `momento.kind` y muestra las entidades vinculadas como chips
 * de typeAccent debajo.
 *
 * Tres renderers internos (RecorteBody, FotoBody, NotaBody) — son
 * cortos y dependen del mismo Momento, así que vivir en el mismo
 * archivo es razonable. Si alguno crece, se va a su propio archivo.
 */
export function MomentoEntry({
  momento,
  entitiesById,
  onDelete,
}: {
  momento: Momento
  entitiesById: Map<string, Entity>
  onDelete: () => void
}) {
  const linkedEntities = momento.entityIds
    .map((id) => entitiesById.get(id))
    .filter((e): e is Entity => Boolean(e))

  return (
    <li className="group relative pl-5">
      {/* Marca temporal a la izquierda — italic tipográfico, no chip.
          Es la marginalia del manuscrito: dice CUÁNDO sin estorbar
          la lectura del QUÉ. */}
      <span
        className="absolute left-0 top-1 text-caption italic text-ink-300 tabular-nums w-12 -ml-1 text-right pr-2 border-r border-ink-100/40"
        aria-hidden="true"
      >
        {formatTime(momento.capturedAt)}
      </span>
      <div className="ml-12">
        {momento.kind === 'nota' && <NotaBody momento={momento} />}
        {momento.kind === 'recorte' && <RecorteBody momento={momento} />}
        {momento.kind === 'foto' && <FotoBody momento={momento} />}

        {momento.origin.kind === 'ai' && (
          <span
            className="ml-2 inline-flex items-center text-sky-700/70"
            title="origen IA"
          >
            <SparkleIcon size={10} />
          </span>
        )}

        {linkedEntities.length > 0 && (
          <LinkedEntities entities={linkedEntities} />
        )}
      </div>
      <button
        onClick={onDelete}
        className="absolute right-0 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-ink-400 hover:text-red-700 hover:bg-ink-100 rounded"
        aria-label="Eliminar momento"
        title="Eliminar"
      >
        <TrashIcon size={12} />
      </button>
    </li>
  )
}

function NotaBody({ momento }: { momento: Momento }) {
  if (!momento.payload.bodyText) return null
  return (
    <p className="font-serif text-base text-ink-700 leading-relaxed whitespace-pre-wrap">
      {momento.payload.bodyText}
    </p>
  )
}

function RecorteBody({ momento }: { momento: Momento }) {
  const { url, title, bodyText, source, author } = momento.payload
  return (
    <article className="space-y-1.5">
      {(source || author) && (
        <p className="section-eyebrow-serif flex items-baseline gap-2 flex-wrap">
          {author && <span style={{ color: 'var(--accent-gold)' }}>{author}</span>}
          {author && source && <span className="text-ink-200">·</span>}
          {source && <span className="text-ink-400">{source}</span>}
        </p>
      )}
      {title && (
        <h4 className="font-serif text-lg text-ink-700 leading-snug">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink-900 transition-colors border-b border-dotted border-transparent hover:border-ink-400"
            >
              {title}
              <span className="text-ink-300 text-sm ml-1">↗</span>
            </a>
          ) : (
            title
          )}
        </h4>
      )}
      {!title && url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-ink-500 hover:text-ink-700 transition-colors underline decoration-dotted"
        >
          {url} ↗
        </a>
      )}
      {bodyText && (
        <p className="font-serif text-base text-ink-600 leading-relaxed whitespace-pre-wrap border-l-2 border-ink-200/60 pl-3 italic">
          {bodyText}
        </p>
      )}
      {momento.note && (
        <p className="marginalia-script whitespace-pre-wrap mt-2">{momento.note}</p>
      )}
    </article>
  )
}

function FotoBody({ momento }: { momento: Momento }) {
  const { storageKey, caption, width, height } = momento.payload
  if (!storageKey) {
    return (
      <p className="text-caption italic text-ink-400">(imagen no encontrada)</p>
    )
  }
  const aspectRatio =
    width && height && width > 0 && height > 0
      ? `${width} / ${height}`
      : undefined

  return (
    <article className="space-y-2">
      <div className="rounded-md overflow-hidden border border-ink-100/60 max-w-md">
        <img
          src={`/api/momentos/file/${encodeURIComponent(storageKey)}`}
          alt={caption ?? 'momento'}
          loading="lazy"
          className="block w-full h-auto"
          style={aspectRatio ? { aspectRatio } : undefined}
        />
      </div>
      {caption && (
        <p className="font-serif text-sm italic text-ink-500 max-w-md">
          {caption}
        </p>
      )}
      {momento.note && (
        <p className="marginalia-script whitespace-pre-wrap max-w-md">
          {momento.note}
        </p>
      )}
    </article>
  )
}

function LinkedEntities({ entities }: { entities: Entity[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {entities.map((e) => {
        const accent = typeAccent(e.type)
        return (
          <li
            key={e.id}
            className="inline-flex items-center px-2 py-0.5 rounded-full text-micro tracking-eyebrow"
            style={{
              backgroundColor: `color-mix(in srgb, ${accent} 11%, transparent)`,
              color: accent,
            }}
            title={e.type}
          >
            {e.name}
          </li>
        )
      })}
    </ul>
  )
}
