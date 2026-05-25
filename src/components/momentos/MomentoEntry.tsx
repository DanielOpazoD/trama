import { useState } from 'react'
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
  // υ-multi: el render lee `items[]` si existe (momentos nuevos con
  // 1+ fotos). Si solo hay `storageKey` legacy, lo envuelve en un
  // array de 1 para tratarlo igual. Si no hay nada, mostramos el
  // placeholder de error.
  const { items, storageKey, width, height, caption } = momento.payload
  const photos: Array<{ storageKey: string; width?: number; height?: number }> =
    items && items.length > 0
      ? items
      : storageKey
        ? [{ storageKey, width, height }]
        : []

  if (photos.length === 0) {
    return (
      <p className="text-caption italic text-ink-400">(imagen no encontrada)</p>
    )
  }

  return (
    <article className="space-y-2">
      {photos.length === 1 ? (
        <SinglePhoto photo={photos[0]} caption={caption} />
      ) : (
        <PhotoGallery photos={photos} caption={caption} />
      )}
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

function SinglePhoto({
  photo,
  caption,
}: {
  photo: { storageKey: string; width?: number; height?: number }
  caption?: string
}) {
  const aspectRatio =
    photo.width && photo.height && photo.width > 0 && photo.height > 0
      ? `${photo.width} / ${photo.height}`
      : undefined
  return (
    <div className="rounded-md overflow-hidden border border-ink-100/60 max-w-md">
      <img
        src={`/api/momentos-file/${encodeURIComponent(photo.storageKey)}`}
        alt={caption ?? 'momento'}
        loading="lazy"
        className="block w-full h-auto"
        style={aspectRatio ? { aspectRatio } : undefined}
      />
    </div>
  )
}

/**
 * υ-multi: visor con paginación interna para un momento con varias
 * fotos. Muestra una foto "activa" grande + thumbs debajo, y permite
 * navegar con flechas (← → en teclado, o tap en los thumbs).
 *
 * El número actual / total ("3 / 7") aparece arriba a la derecha del
 * frame para que el usuario sepa cuántas fotos tiene el episodio.
 */
function PhotoGallery({
  photos,
  caption,
}: {
  photos: Array<{ storageKey: string; width?: number; height?: number }>
  caption?: string
}) {
  const [active, setActive] = useState(0)
  const current = photos[active]
  const aspectRatio =
    current.width && current.height && current.width > 0 && current.height > 0
      ? `${current.width} / ${current.height}`
      : undefined

  function prev() {
    setActive((i) => (i === 0 ? photos.length - 1 : i - 1))
  }
  function next() {
    setActive((i) => (i === photos.length - 1 ? 0 : i + 1))
  }

  return (
    <div className="max-w-md">
      <div className="relative rounded-md overflow-hidden border border-ink-100/60 group">
        <img
          key={current.storageKey}
          src={`/api/momentos-file/${encodeURIComponent(current.storageKey)}`}
          alt={caption ?? `foto ${active + 1} de ${photos.length}`}
          loading="lazy"
          className="block w-full h-auto"
          style={aspectRatio ? { aspectRatio } : undefined}
        />
        {/* Contador arriba derecha */}
        <span
          className="absolute top-2 right-2 text-micro tabular-nums bg-ink-900/65 text-paper-50 px-1.5 py-0.5 rounded leading-none"
          aria-hidden
        >
          {active + 1} / {photos.length}
        </span>
        {/* Botones prev / next — visibles siempre en mobile, fade-in en hover en desktop */}
        <button
          type="button"
          onClick={prev}
          aria-label="Foto anterior"
          className="absolute left-1.5 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center rounded-full bg-ink-900/55 text-paper-50 hover:bg-ink-900/80 transition-opacity opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={next}
          aria-label="Foto siguiente"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center rounded-full bg-ink-900/55 text-paper-50 hover:bg-ink-900/80 transition-opacity opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          ›
        </button>
      </div>
      {/* Thumbs strip */}
      <div className="mt-1.5 flex gap-1 overflow-x-auto pb-1">
        {photos.map((p, idx) => (
          <button
            key={p.storageKey}
            type="button"
            onClick={() => setActive(idx)}
            aria-label={`Mostrar foto ${idx + 1}`}
            aria-current={idx === active ? 'true' : undefined}
            className={`shrink-0 size-12 rounded overflow-hidden border-2 transition-colors ${
              idx === active
                ? 'border-ink-700'
                : 'border-transparent hover:border-ink-300'
            }`}
          >
            <img
              src={`/api/momentos-file/${encodeURIComponent(p.storageKey)}`}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
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
