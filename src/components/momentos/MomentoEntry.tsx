import { memo, useState } from 'react'
import { typeAccent } from '../../lib/typeAccents'
import type { Entity, Momento } from '../../types'
import { PencilIcon, SparkleIcon, TrashIcon } from '../Icons'
import { OverflowMenu, OverflowMenuItem } from '../OverflowMenu'
import { WhatsAppSourceTag } from '../WhatsAppSourceTag'
import { formatTime, getMomentoPhotoItems, isVideoItem, momentoMediaUrl } from './helpers'
import {
  AuthenticatedMomentoImage,
  AuthenticatedMomentoVideo,
  MomentoVideoThumb,
} from './AuthenticatedMedia'
import { VideoPlayBadge } from './VideoPlayBadge'
import { MomentoEditModal } from './MomentoEditModal'
import { PhotoLightbox } from './PhotoLightbox'
import { AudioNote } from './AudioNote'
import { MomentoOwnerMark } from './MomentoOwnerMark'
import { MomentoFeedback } from './MomentoFeedback'

/**
 * Una entrada del timeline de Momentos. Despacha al renderer correcto
 * según `momento.kind` y muestra las entidades vinculadas como chips
 * de typeAccent debajo.
 *
 * Tres renderers internos (RecorteBody, FotoBody, NotaBody) — son
 * cortos y dependen del mismo Momento, así que vivir en el mismo
 * archivo es razonable. Si alguno crece, se va a su propio archivo.
 */
/**
 * ω-hilo: color del nodo del eje temporal según el carácter del momento.
 * Tonos sobrios y distintos entre sí (violáceo/azul/verde/tierra), no un
 * arcoíris; un episodio con video se separa del de solo fotos.
 */
function momentoAccent(momento: Momento): string {
  if (momento.kind === 'nota') return 'var(--accent-gold)'
  if (momento.kind === 'recorte') return 'var(--accent-primary)'
  return getMomentoPhotoItems(momento.payload).some(isVideoItem)
    ? 'var(--type-evento)'
    : 'var(--accent-sage)'
}

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
  const canEdit = momento.accessRole !== 'viewer'
  const canDelete = !momento.shared

  return (
    <li className="group relative pl-5">
      {/* Marca temporal a la izquierda — italic tipográfico, no chip.
          Es la marginalia del manuscrito: dice CUÁNDO sin estorbar
          la lectura del QUÉ. */}
      <span
        className="absolute left-0 top-1 text-caption italic text-ink-300 tabular-nums w-12 -ml-1 text-right pr-3"
        aria-hidden="true"
      >
        {formatTime(momento.capturedAt)}
      </span>
      {/* ω-hilo: el eje temporal del manuscrito. Un nodo a la altura de la
          hora y un filete que desciende desvaneciéndose hacia la entrada
          siguiente — encadena los momentos del día como cuentas de un hilo.
          El nodo se tiñe por el carácter del momento (nota/recorte/foto/
          video), así el hilo cuenta la textura del día de un vistazo.
          Ornamental (aria-hidden) y absoluto: no altera el layout. */}
      <span
        aria-hidden
        className="absolute left-11 top-2 size-1.5 -translate-x-1/2 rounded-full ring-2 ring-paper-50"
        style={{ backgroundColor: momentoAccent(momento) }}
      />
      <span
        aria-hidden
        className="absolute left-11 top-4 -bottom-4 w-px -translate-x-1/2 bg-gradient-to-b from-ink-200/60 to-transparent"
      />
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

        <WhatsAppSourceTag origin={momento.origin} />

        <MomentoOwnerMark momento={momento} />
        <MomentoFeedback momentoId={momento.id} />

        {linkedEntities.length > 0 && <LinkedEntities entities={linkedEntities} />}
      </div>
      {/* Menú contextual compacto — evita llenar la esquina de iconos sueltos.
          Es el OverflowMenu compartido, no un popover artesanal: la versión a
          mano no se cerraba ni con Escape ni con clic afuera — en teclado o
          táctil quedaba abierto hasta pulsar el propio botón otra vez. */}
      {(canEdit || canDelete) && (
        <div className="absolute right-0 top-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <OverflowMenu
            label="Opciones del momento"
            width="w-36"
            triggerClassName="p-1.5 text-ink-400 hover:text-ink-700 hover:bg-ink-100 rounded transition-colors"
            triggerContent={
              <span aria-hidden className="block text-lead leading-none -mt-1">
                ⋯
              </span>
            }
          >
            {(close) => (
              <>
                {canEdit && (
                  <OverflowMenuItem
                    onClick={() => {
                      close()
                      setEditOpen(true)
                    }}
                  >
                    <PencilIcon size={12} />
                    Editar
                  </OverflowMenuItem>
                )}
                {canDelete && (
                  <OverflowMenuItem
                    danger
                    onClick={() => {
                      close()
                      onDelete()
                    }}
                  >
                    <TrashIcon size={12} />
                    Eliminar
                  </OverflowMenuItem>
                )}
              </>
            )}
          </OverflowMenu>
        </div>
      )}
      <MomentoEditModal
        momento={momento}
        open={editOpen}
        onClose={() => setEditOpen(false)}
      />
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
    <p className="font-serif text-lead text-ink-700 leading-relaxed whitespace-pre-wrap">
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
        <h4 className="font-serif text-lead text-ink-700 leading-snug">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink-800 transition-colors border-b border-dotted border-transparent hover:border-ink-400"
            >
              {title}
              <span className="text-ink-300 text-caption ml-1">↗</span>
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
          className="text-caption text-ink-500 hover:text-ink-700 transition-colors underline decoration-dotted"
        >
          {url} ↗
        </a>
      )}
      {bodyText && (
        <p className="font-serif text-lead text-ink-600 leading-relaxed whitespace-pre-wrap border-l-2 border-ink-200/60 pl-3 italic">
          {bodyText}
        </p>
      )}
      {momento.note && (
        // Mismo estilo que las notas de texto (NotaBody) — coherencia
        // tipográfica entre los 3 kinds. La cursiva manuscrita queda
        // reservada para userReflection en QuoteItem.
        <p className="font-serif text-lead text-ink-700 leading-relaxed whitespace-pre-wrap mt-2">
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
  // Clip con póster: el timeline muestra la miniatura y recién al play monta
  // el <video> (que baja el blob entero). Sin póster no hay estado: se monta
  // el reproductor directo, como siempre.
  const [videoRequested, setVideoRequested] = useState(false)

  if (photos.length === 0) {
    return <p className="text-caption italic text-ink-400">(imagen no encontrada)</p>
  }

  const cover = photos[0]!
  const coverIsVideo = isVideoItem(cover)
  const extraCount = photos.length - 1
  const aspectRatio =
    cover.width && cover.height && cover.width > 0 && cover.height > 0
      ? `${cover.width} / ${cover.height}`
      : undefined

  return (
    <article className="space-y-2">
      <div className="max-w-md relative">
        {coverIsVideo ? (
          cover.posterStorageKey && !videoRequested ? (
            // ω-video + póster: miniatura liviana; el blob del clip solo se
            // baja si el usuario pide reproducir.
            <button
              type="button"
              onClick={() => setVideoRequested(true)}
              aria-label="Reproducir video"
              className="relative block w-full rounded-md overflow-hidden border border-ink-100/60 bg-ink-900 cursor-pointer hover:opacity-95 transition-opacity"
              style={{ aspectRatio: aspectRatio ?? '16 / 9' }}
            >
              <MomentoVideoThumb
                storageKey={cover.storageKey}
                posterStorageKey={cover.posterStorageKey}
                alt={caption ?? 'video'}
                className="h-full w-full object-contain"
              />
              <VideoPlayBadge />
            </button>
          ) : (
            // ω-video: el clip se reproduce inline con los controles nativos.
            // No se envuelve en el botón de zoom (capturaría los clics del
            // player). object-contain sobre fondo tinta evita distorsión y da
            // el letterbox de cine cuando el ratio no calza. autoPlay solo si
            // venimos del póster; arranca mudo (el blob llega DESPUÉS del
            // click, y un autoplay con sonido fuera del gesto lo bloquea el
            // navegador — ver AuthenticatedMomentoVideo).
            <AuthenticatedMomentoVideo
              storageKey={cover.storageKey}
              controls
              playsInline
              autoPlay={videoRequested || undefined}
              preload="metadata"
              className="block w-full rounded-md overflow-hidden border border-ink-100/60 bg-ink-900 object-contain"
              style={{ aspectRatio: aspectRatio ?? '16 / 9' }}
            />
          )
        ) : (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            aria-label={
              photos.length === 1
                ? 'Abrir foto'
                : `Abrir visor — ${photos.length} elementos`
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
        )}
        {/* Badge "+N" si el episodio trae más piezas. Cuando la portada es
            foto, el botón de zoom de atrás ya abre el visor y el badge es
            decorativo; cuando es video (que captura sus clics), el badge ES
            el disparador del visor. */}
        {extraCount > 0 &&
          (coverIsVideo ? (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              aria-label={`Abrir visor — ${photos.length} elementos`}
              className="absolute top-2 right-2 text-micro uppercase tracking-eyebrow tabular-nums bg-ink-900/70 text-paper-50 px-1.5 py-0.5 rounded leading-none transition-colors hover:bg-ink-900/90"
            >
              +{extraCount}
            </button>
          ) : (
            <span
              className="pointer-events-none absolute top-2 right-2 text-micro uppercase tracking-eyebrow tabular-nums bg-ink-900/70 text-paper-50 px-1.5 py-0.5 rounded leading-none"
              aria-hidden
            >
              +{extraCount}
            </span>
          ))}
      </div>
      {caption && (
        <p className="font-serif text-caption italic text-ink-500 max-w-md">{caption}</p>
      )}
      {momento.note && (
        // Mismo estilo que las notas de texto — coherencia con NotaBody.
        <p className="font-serif text-lead text-ink-700 leading-relaxed whitespace-pre-wrap max-w-md">
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
