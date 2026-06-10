import { memo, useState } from 'react'
import { typeAccent } from '../../lib/typeAccents'
import type { Entity, Momento } from '../../types'
import { PencilIcon, ShareIcon, SparkleIcon, TrashIcon } from '../Icons'
import { formatTime, getMomentoPhotoItems, momentoMediaUrl } from './helpers'
import { AuthenticatedMomentoImage } from './AuthenticatedMedia'
import { MomentoEditModal } from './MomentoEditModal'
import { PhotoLightbox } from './PhotoLightbox'
import { AudioNote } from './AudioNote'
import { Tooltip } from '../Tooltip'
import { MomentoOwnerMark } from './MomentoOwnerMark'
import { MomentoShareModal } from './MomentoShareModal'

/**
 * Una entrada del timeline de Momentos. Despacha al renderer correcto
 * según `momento.kind` y muestra las entidades vinculadas como chips
 * de typeAccent debajo.
 *
 * Tres renderers internos (RecorteBody, FotoBody, NotaBody) — son
 * cortos y dependen del mismo Momento, así que vivir en el mismo
 * archivo es razonable. Si alguno crece, se va a su propio archivo.
 */
function MomentoEntryInternal({
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
  // Estado del modal de edición. Aplica a los 3 kinds (nota, recorte,
  // foto) — el modal despacha al sub-renderer correcto según kind.
  const [editOpen, setEditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const canEdit = momento.accessRole !== 'viewer'
  const canDelete = !momento.shared
  const canShare =
    !momento.shared &&
    (momento.accessRole === undefined || momento.accessRole === 'owner')

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
            className="ml-2 inline-flex items-center text-[color:var(--accent-primary)]"
            title="origen IA"
          >
            <SparkleIcon size={10} />
          </span>
        )}

        <MomentoOwnerMark momento={momento} />

        {linkedEntities.length > 0 && <LinkedEntities entities={linkedEntities} />}
      </div>
      {/* Toolbar contextual al hover — editar (todos los kinds) + eliminar. */}
      <div className="absolute right-0 top-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
        {canEdit && (
          <Tooltip content="Editar contenido y fecha">
            <button
              onClick={() => setEditOpen(true)}
              className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded transition-colors"
              aria-label="Editar momento"
            >
              <PencilIcon size={12} />
            </button>
          </Tooltip>
        )}
        {canShare && (
          <Tooltip content="Compartir momento">
            <button
              onClick={() => setShareOpen(true)}
              className="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded transition-colors"
              aria-label="Compartir momento"
            >
              <ShareIcon size={12} />
            </button>
          </Tooltip>
        )}
        {canDelete && (
          <Tooltip content="Eliminar momento">
            <button
              onClick={onDelete}
              className="p-1.5 text-ink-400 hover:text-[color:var(--accent-clay)] hover:bg-ink-100 rounded transition-colors"
              aria-label="Eliminar momento"
            >
              <TrashIcon size={12} />
            </button>
          </Tooltip>
        )}
      </div>
      <MomentoEditModal
        momento={momento}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
      {shareOpen && (
        <MomentoShareModal momento={momento} onClose={() => setShareOpen(false)} />
      )}
    </li>
  )
}

/**
 * Q3: memoizamos para que scroll del timeline de Momentos no re-renderice
 * cada entry al cambiar state global. `entitiesById` es un Map — su
 * referencia cambia cuando se mutan entidades, pero NO en navegación
 * normal entre vistas (TanStack Query mantiene la lista estable).
 * Ignoramos onDelete (el padre la re-crea inline).
 */
export const MomentoEntry = memo(MomentoEntryInternal, (prev, next) => {
  return prev.momento === next.momento && prev.entitiesById === next.entitiesById
})

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
              className="hover:text-ink-800 transition-colors border-b border-dotted border-transparent hover:border-ink-400"
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
        // Mismo estilo que las notas de texto (NotaBody) — coherencia
        // tipográfica entre los 3 kinds. La cursiva manuscrita queda
        // reservada para userReflection en QuoteItem.
        <p className="font-serif text-base text-ink-700 leading-relaxed whitespace-pre-wrap mt-2">
          {momento.note}
        </p>
      )}
    </article>
  )
}

function FotoBody({ momento }: { momento: Momento }) {
  // υ-multi + AA-C: render del momento foto.
  // - Si hay 1 foto: la muestra directo. Click abre lightbox con esa.
  // - Si hay >1: muestra SOLO la primera + badge "+N" arriba derecha
  //   indicando que hay más. Click → lightbox con todas en grande
  //   y navegación.
  // El render del timeline mantiene altura visual baja sin importar
  // cuántas fotos tenga el episodio.
  const { caption, audioKey } = momento.payload
  const photos = getMomentoPhotoItems(momento.payload)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  if (photos.length === 0) {
    return <p className="text-caption italic text-ink-400">(imagen no encontrada)</p>
  }

  const cover = photos[0]!
  const extraCount = photos.length - 1
  const aspectRatio =
    cover.width && cover.height && cover.width > 0 && cover.height > 0
      ? `${cover.width} / ${cover.height}`
      : undefined

  return (
    <article className="space-y-2">
      <div className="max-w-md relative">
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          aria-label={
            photos.length === 1 ? 'Abrir foto' : `Abrir visor — ${photos.length} fotos`
          }
          className="block w-full rounded-md overflow-hidden border border-ink-100/60 cursor-zoom-in hover:opacity-95 transition-opacity"
        >
          <AuthenticatedMomentoImage
            storageKey={cover.storageKey}
            alt={caption ?? 'momento'}
            loading="lazy"
            className="block w-full h-auto"
            style={aspectRatio ? { aspectRatio } : undefined}
          />
        </button>
        {/* Badge "+N" si hay más fotos. Sutilmente sobre la esquina
            superior derecha. No-interactive (el click del button de
            atrás lo cubre). */}
        {extraCount > 0 && (
          <span
            className="pointer-events-none absolute top-2 right-2 text-micro uppercase tracking-eyebrow tabular-nums bg-ink-900/70 text-paper-50 px-1.5 py-0.5 rounded leading-none"
            aria-hidden
          >
            +{extraCount}
          </span>
        )}
      </div>
      {caption && (
        <p className="font-serif text-sm italic text-ink-500 max-w-md">{caption}</p>
      )}
      {momento.note && (
        // Mismo estilo que las notas de texto — coherencia con NotaBody.
        <p className="font-serif text-base text-ink-700 leading-relaxed whitespace-pre-wrap max-w-md">
          {momento.note}
        </p>
      )}
      {audioKey && (
        // Nota de voz del episodio. Se sirve por el mismo endpoint que las
        // fotos (devuelve Content-Type desde la metadata del blob).
        <div className="max-w-md">
          <AudioNote src={momentoMediaUrl(audioKey)} />
        </div>
      )}
      <PhotoLightbox
        photos={photos}
        caption={caption}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
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
